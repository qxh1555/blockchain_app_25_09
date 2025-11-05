const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*'
  },
});

app.use(cors());
app.use(express.json());

// API Routes for Authentication
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).send('Username and password are required');
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await db.User.create({ username, password: hashedPassword });
    res.status(201).send({ message: 'User registered successfully', userId: user.id });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).send('Username already exists');
    }
    res.status(500).send('Error registering user');
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).send('Username and password are required');
  }

  try {
    const user = await db.User.findOne({ where: { username } });

    if (!user) {
      return res.status(401).send('Invalid credentials');
    }

    const match = await bcrypt.compare(password, user.password);

    if (match) {
      const token = jwt.sign({ id: user.id, username: user.username }, '123456', { expiresIn: '1h' });
      res.json({ token, userId: user.id, username: user.username });
    } else {
      res.status(401).send('Invalid credentials');
    }
  } catch (error) {
    res.status(500).send('Error logging in');
  }
});


// --- Game Logic (WebSockets) ---
const commodities = [
    { name: 'Gold', imageUrl: '/images/gold.png' },
    { name: 'Silver', imageUrl: '/images/silver.png' },
    { name: 'Crude Oil', imageUrl: '/images/oil.png' },
    { name: 'Natural Gas', imageUrl: '/images/gas.png' },
    { name: 'Corn', imageUrl: '/images/corn.png' },
    { name: 'Wheat', imageUrl: '/images/wheat.png' },
    { name: 'Coffee', imageUrl: '/images/coffee.png' },
    { name: 'Sugar', imageUrl: '/images/sugar.png' },
];

let connectedUsers = {}; // Maps userId to socket
let gameState = {
    players: {},
    commodities: []
};

const broadcastGameState = () => {
    io.emit('gameStateUpdate', gameState);
}

io.on('connection', (socket) => {
    console.log(`A user connected: ${socket.id}`);

    socket.on('playerReady', async (user) => {
        console.log(`Player ${user.username} (${user.id}) is ready`);
        connectedUsers[user.id] = socket;

        // If player is not in game state, initialize them
        if (!gameState.players[user.id]) {
            const dbUser = await db.User.findByPk(user.id);
            gameState.players[user.id] = {
                id: user.id,
                username: user.username,
                balance: dbUser.balance,
                inventory: {}
            };

            // Randomly assign initial commodities
            const allCommodities = await db.Commodity.findAll();
            for (const commodity of allCommodities) {
                const quantity = Math.floor(Math.random() * 10);
                if (quantity > 0) {
                    await db.Inventory.create({
                        UserId: user.id,
                        CommodityId: commodity.id,
                        quantity: quantity
                    });
                    gameState.players[user.id].inventory[commodity.id] = quantity;
                }
            }
        }

        // Load and emit trade history
        const tradeHistory = await db.Trade.findAll({
            where: {
                [db.Sequelize.Op.or]: [
                    { fromUserId: user.id },
                    { toUserId: user.id }
                ]
            },
            order: [['createdAt', 'DESC']]
        });
        socket.emit('tradeHistory', tradeHistory);

        broadcastGameState();
    });

    socket.on('proposeTrade', async (tradeData) => {
        const { fromUserId, toUserId, tradeDetails, tradeId } = tradeData; 
        const toSocket = connectedUsers[toUserId];
        
        try {
            await db.Trade.create({
                id: tradeId,
                fromUserId,
                toUserId,
                commodityId: tradeDetails.commodityId,
                quantity: tradeDetails.quantity,
                price: tradeDetails.price,
                action: tradeDetails.action,
                status: 'pending'
            });

            if (toSocket) {
                toSocket.emit('tradeProposal', { fromUserId, toUserId, tradeDetails, tradeId });
            }
        } catch (error) {
            console.error('Failed to save trade proposal:', error);
            // Optionally, emit an error back to the proposer
        }
    });

    socket.on('tradeResponse', async (responseData) => {
        const { fromUserId, toUserId, accepted, tradeDetails, tradeId } = responseData;
        const fromSocket = connectedUsers[fromUserId];
        const toSocket = connectedUsers[toUserId];

        if (accepted) {
            try {
                await db.sequelize.transaction(async (t) => {
                    const { commodityId, quantity, price } = tradeDetails;

                    const sellerId = tradeDetails.action === 'buy' ? toUserId : fromUserId;
                    const buyerId = tradeDetails.action === 'buy' ? fromUserId : toUserId;

                    const seller = await db.User.findByPk(sellerId, { transaction: t });
                    const buyer = await db.User.findByPk(buyerId, { transaction: t });

                    const sellerInventory = await db.Inventory.findOne({ where: { UserId: sellerId, CommodityId: commodityId }, transaction: t });

                    if (!sellerInventory || sellerInventory.quantity < quantity) {
                        throw new Error('Insufficient inventory');
                    }

                    if (buyer.balance < price) {
                        throw new Error('Insufficient balance');
                    }

                    // Update inventories
                    sellerInventory.quantity -= quantity;
                    await sellerInventory.save({ transaction: t });

                    let buyerInventory = await db.Inventory.findOne({ where: { UserId: buyerId, CommodityId: commodityId }, transaction: t });
                    if (!buyerInventory) {
                        buyerInventory = await db.Inventory.create({ UserId: buyerId, CommodityId: commodityId, quantity: 0 }, { transaction: t });
                    }
                    buyerInventory.quantity += quantity;
                    await buyerInventory.save({ transaction: t });

                    // Update balances
                    seller.balance += price;
                    buyer.balance -= price;

                    await seller.save({ transaction: t });
                    await buyer.save({ transaction: t });

                    // Update gameState
                    gameState.players[sellerId].balance = seller.balance;
                    gameState.players[buyerId].balance = buyer.balance;
                    gameState.players[sellerId].inventory[commodityId] = sellerInventory.quantity;
                    gameState.players[buyerId].inventory[commodityId] = buyerInventory.quantity;

                    // Update trade status
                    await db.Trade.update({ status: 'successful' }, { where: { id: tradeId }, transaction: t });

                    broadcastGameState();
                });

                const result = { success: true, message: 'Trade successful', tradeId };
                if (fromSocket) fromSocket.emit('tradeResult', result);
                if (toSocket) toSocket.emit('tradeResult', result);

            } catch (error) {
                await db.Trade.update({ status: 'failed', message: error.message }, { where: { id: tradeId } });
                const result = { success: false, message: error.message, tradeId };
                if (fromSocket) fromSocket.emit('tradeResult', result);
                if (toSocket) toSocket.emit('tradeResult', result);
            }
        } else {
            await db.Trade.update({ status: 'rejected' }, { where: { id: tradeId } });
            const result = { success: false, message: 'Trade rejected', tradeId };
            if (fromSocket) fromSocket.emit('tradeResult', result);
            if (toSocket) toSocket.emit('tradeResult', result);
        }
    });

    socket.on('disconnect', () => {
        console.log(`A user disconnected: ${socket.id}`);
        for (const userId in connectedUsers) {
            if (connectedUsers[userId].id === socket.id) {
                delete connectedUsers[userId];
                break;
            }
        }
    });
});


// Start the server and sync the database
const PORT = process.env.PORT || 3001;
const startServer = async () => {
    try {
        await db.sequelize.sync({ alter: true }); // Using alter to be safe with existing tables
        console.log('Database synced successfully.');

        // Create commodities if they don't exist
        const commodityCount = await db.Commodity.count();
        if (commodityCount === 0) {
            await db.Commodity.bulkCreate(commodities);
            console.log('Created initial commodities.');
        }
        gameState.commodities = await db.Commodity.findAll();

        server.listen(PORT, () => {
            console.log(`Server is listening on port ${PORT}`);
        });
    } catch (error) {
        console.error('Unable to connect to the database:', error);
    }
};

startServer();