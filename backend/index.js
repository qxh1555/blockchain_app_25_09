const express = require('express');
const { ethers } = require('ethers');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const db = require('./db');
const { batchOnChainTrades } = require('./onChainService');

// --- Blockchain Configuration ---
const contractAddress = "0x51D867BFd8aA363619Ba60A13Af9c000C2504E4e";
const contractABI = [
    {
      "anonymous": false,
      "inputs": [
        { "indexed": false, "internalType": "string", "name": "tradeId", "type": "string" },
        { "indexed": false, "internalType": "uint256", "name": "fromUserId", "type": "uint256" },
        { "indexed": false, "internalType": "uint256", "name": "toUserId", "type": "uint256" },
        { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }
      ],
      "name": "TradeLogged",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        { "indexed": false, "internalType": "uint256", "name": "userId", "type": "uint256" },
        { "indexed": false, "internalType": "uint256", "name": "redemptionRuleId", "type": "uint256" },
        { "indexed": false, "internalType": "uint256", "name": "reward", "type": "uint256" },
        { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }
      ],
      "name": "RedemptionLogged",
      "type": "event"
    },
    {
        "anonymous": false,
        "inputs": [
          { "indexed": false, "internalType": "uint256", "name": "userId", "type": "uint256" },
          { "indexed": false, "internalType": "uint256", "name": "initialBalance", "type": "uint256" },
          { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }
        ],
        "name": "UserInitialized",
        "type": "event"
    },
    {
      "inputs": [
        { "internalType": "string", "name": "_tradeId", "type": "string" },
        { "internalType": "uint256", "name": "_fromUserId", "type": "uint256" },
        { "internalType": "uint256", "name": "_toUserId", "type": "uint256" },
        { "internalType": "uint256", "name": "_commodityId", "type": "uint256" },
        { "internalType": "uint256", "name": "_quantity", "type": "uint256" },
        { "internalType": "uint256", "name": "_price", "type": "uint256" }
      ],
      "name": "addTrade",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "getTradeCount",
      "outputs": [ { "internalType": "uint256", "name": "", "type": "uint256" } ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        { "internalType": "uint256", "name": "_userId", "type": "uint256" },
        { "internalType": "uint256", "name": "_redemptionRuleId", "type": "uint256" },
        { "internalType": "uint256", "name": "_reward", "type": "uint256" }
      ],
      "name": "addRedemption",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "getRedemptionCount",
      "outputs": [ { "internalType": "uint256", "name": "", "type": "uint256" } ],
      "stateMutability": "view",
      "type": "function"
    },
    {
        "inputs": [
            { "internalType": "uint256", "name": "_userId", "type": "uint256" },
            { "internalType": "uint256", "name": "_initialBalance", "type": "uint256" },
            { "internalType": "uint256[]", "name": "_commodityIds", "type": "uint256[]" },
            { "internalType": "uint256[]", "name": "_quantities", "type": "uint256[]" }
        ],
        "name": "initializeUser",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "getInitialStateCount",
        "outputs": [ { "internalType": "uint256", "name": "", "type": "uint256" } ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "uint256", "name": "_index", "type": "uint256" }
        ],
        "name": "getInitialStateRecord",
        "outputs": [
            { "internalType": "uint256", "name": "userId", "type": "uint256" },
            { "internalType": "uint256", "name": "initialBalance", "type": "uint256" },
            { "components": [
                { "internalType": "uint256", "name": "commodityId", "type": "uint256" },
                { "internalType": "uint256", "name": "quantity", "type": "uint256" }
            ], "internalType": "struct DataRegistry.InitialStateItem[]", "name": "inventory", "type": "tuple[]" },
            { "internalType": "uint256", "name": "timestamp", "type": "uint256" }
        ],
        "stateMutability": "view",
        "type": "function"
    }
];
const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
// --- End of Blockchain Configuration ---

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*'
  },
});

app.use(cors());
app.use(express.json());

/**
 * Creates an initial random inventory for a new user.
 * @param {object} user - The Sequelize user object.
 * @returns {Promise<{initialBalance: number, inventory: Array<{commodityId: number, quantity: number}>}>}
 */
async function initializeNewUserState(user) {
    const allCommodities = await db.Commodity.findAll();
    const initialInventory = [];

    for (const commodity of allCommodities) {
        const quantity = Math.floor(Math.random() * 10);
        if (quantity > 0) {
            await db.Inventory.create({ UserId: user.id, CommodityId: commodity.id, quantity: quantity });
            initialInventory.push({ commodityId: commodity.id, quantity });
        }
    }
    return { initialBalance: user.balance, inventory: initialInventory };
}

// API Routes for Authentication
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).send('Username and password are required');
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await db.User.create({ username, password: hashedPassword });

    // Initialize user state (balance is default, create inventory) and record on-chain
    const { initialBalance, inventory } = await initializeNewUserState(user);

    try {
        console.log(`[On-Chain] Initializing state for new user ${user.id}...`);
        const signer = await provider.getSigner(0);
        const contract = new ethers.Contract(contractAddress, contractABI, signer);

        const commodityIds = inventory.map(item => item.commodityId);
        const quantities = inventory.map(item => item.quantity);

        const tx = await contract.initializeUser(
            user.id,
            Math.round(initialBalance), // Pass balance as an integer
            commodityIds,
            quantities
        );
        await tx.wait();
        console.log(`[On-Chain] Initial state for user ${user.id} successfully recorded. Tx hash: ${tx.hash}`);
    } catch (onChainError) {
        console.error(`[On-Chain] FAILED to record initial state for user ${user.id}. Error:`, onChainError.message);
        // This is a non-fatal error. The primary state is in the DB.
    }

    res.status(201).send({ message: 'User registered successfully', userId: user.id });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).send('Username already exists');
    }
    console.error('Error registering user:', error);
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

        const allCommodities = await db.Commodity.findAll();

        if (!gameState.players[user.id]) {
            const dbUser = await db.User.findByPk(user.id);
            const userInventory = await db.Inventory.findAll({ where: { UserId: user.id } });
            
            const inventoryMap = {};
            for (const item of userInventory) {
                inventoryMap[item.CommodityId] = item.quantity;
            }

            gameState.players[user.id] = {
                id: user.id,
                username: user.username,
                balance: dbUser.balance,
                inventory: inventoryMap,
                redemptionRule: null
            };
        }

        let rule = await db.RedemptionRule.findOne({ 
            where: { UserId: user.id },
            include: [{ model: db.RuleItem, include: [db.Commodity] }]
        });

        if (!rule) {
            const reward = Math.floor(Math.random() * 3001) + 2000;
            const newRule = await db.RedemptionRule.create({ UserId: user.id, reward });
            const numItems = Math.floor(Math.random() * 2) + 2;
            const shuffledCommodities = allCommodities.sort(() => 0.5 - Math.random());
            let selectedCommodities = shuffledCommodities.slice(0, numItems);
            const ruleItems = [];
            for (const commodity of selectedCommodities) {
                const quantity = Math.floor(Math.random() * 7) + 1;
                ruleItems.push({ RedemptionRuleId: newRule.id, CommodityId: commodity.id, quantity });
            }
            await db.RuleItem.bulkCreate(ruleItems);
            rule = await db.RedemptionRule.findOne({ 
                where: { id: newRule.id },
                include: [{model: db.RuleItem, include: [db.Commodity]}]
            });
        }

        gameState.players[user.id].redemptionRule = rule ? rule.toJSON() : null;

        const tradeHistory = await db.Trade.findAll({
            where: { [db.Sequelize.Op.or]: [{ fromUserId: user.id }, { toUserId: user.id }] },
            order: [['createdAt', 'DESC']]
        });
        socket.emit('tradeHistory', tradeHistory.map(t => t.toJSON()));

        broadcastGameState();
    });

    socket.on('proposeTrade', async (tradeData) => {
        const { fromUserId, toUserId, tradeDetails, tradeId } = tradeData; 
        const toSocket = connectedUsers[toUserId];
        try {
            await db.Trade.create({ id: tradeId, fromUserId, toUserId, commodityId: tradeDetails.commodityId, quantity: tradeDetails.quantity, price: tradeDetails.price, action: tradeDetails.action, status: 'pending' });
            if (toSocket) {
                toSocket.emit('tradeProposal', { fromUserId, toUserId, tradeDetails, tradeId });
            }
        } catch (error) {
            console.error('Failed to save trade proposal:', error);
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

                    sellerInventory.quantity -= quantity;
                    await sellerInventory.save({ transaction: t });

                    let buyerInventory = await db.Inventory.findOne({ where: { UserId: buyerId, CommodityId: commodityId }, transaction: t });
                    if (!buyerInventory) {
                        buyerInventory = await db.Inventory.create({ UserId: buyerId, CommodityId: commodityId, quantity: 0 }, { transaction: t });
                    }
                    buyerInventory.quantity += quantity;
                    await buyerInventory.save({ transaction: t });

                    seller.balance += price;
                    buyer.balance -= price;
                    await seller.save({ transaction: t });
                    await buyer.save({ transaction: t });

                    gameState.players[sellerId].balance = seller.balance;
                    gameState.players[buyerId].balance = buyer.balance;
                    gameState.players[sellerId].inventory[commodityId] = sellerInventory.quantity;
                    gameState.players[buyerId].inventory[commodityId] = buyerInventory.quantity;

                    await db.Trade.update({ status: 'successful' }, { where: { id: tradeId }, transaction: t });
                });

                broadcastGameState();
                const result = { success: true, message: 'Trade successful', tradeId };
                if (fromSocket) fromSocket.emit('tradeResult', result);
                if (toSocket) toSocket.emit('tradeResult', result);

                // Check if we need to trigger the batch on-chain process
                const pendingOnChainCount = await db.Trade.count({
                  where: { status: 'successful', onChain: false }
                });

                console.log(`[Trigger Check] Pending on-chain trades: ${pendingOnChainCount}`);

                if (pendingOnChainCount >= 10) {
                  console.log(`[Trigger Check] Threshold of 10 reached. Starting batch on-chain process in the background...`);
                  // We call this without await to not block the response.
                  // Errors will be logged by the service itself.
                  batchOnChainTrades().catch(err => {
                    console.error("[Trigger Check] Background on-chain process failed:", err);
                  });
                }

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

    socket.on('redeem', async (userId) => {
        const user = await db.User.findByPk(userId);
        const rule = await db.RedemptionRule.findOne({ 
            where: { UserId: userId },
            include: [{ model: db.RuleItem, include: [db.Commodity] }]
        });

        if (!user || !rule) return socket.emit('redeemResult', { success: false, message: 'No rule found.' });

        try {
            await db.sequelize.transaction(async (t) => {
                for (const item of rule.RuleItems) {
                    const inventory = await db.Inventory.findOne({ where: { UserId: userId, CommodityId: item.CommodityId }, transaction: t });
                    if (!inventory || inventory.quantity < item.quantity) {
                        throw new Error('Insufficient commodities to redeem.');
                    }
                    inventory.quantity -= item.quantity;
                    await inventory.save({ transaction: t });
                    gameState.players[userId].inventory[item.CommodityId] = inventory.quantity;
                }

                user.balance += rule.reward;
                await user.save({ transaction: t });
                gameState.players[userId].balance = user.balance;
            });

            broadcastGameState();
            socket.emit('redeemResult', { success: true, message: `Redeemed for ${rule.reward}!` });

            // --- Add Redemption Record to Blockchain ---
            try {
                console.log(`[On-Chain] Submitting redemption record for user ${userId}...`);
                const signer = await provider.getSigner(0);
                const contract = new ethers.Contract(contractAddress, contractABI, signer);

                const tx = await contract.addRedemption(userId, rule.id, rule.reward);
                await tx.wait();
                console.log(`[On-Chain] Redemption for user ${userId} successfully recorded. Tx hash: ${tx.hash}`);
            } catch (onChainError) {
                // Log the error, but don't send a failure to the user, as the off-chain part was successful.
                console.error(`[On-Chain] FAILED to record redemption for user ${userId} on the blockchain. Error:`, onChainError);
            }
            // --- End of On-Chain Logic ---

        } catch (error) {
            socket.emit('redeemResult', { success: false, message: error.message });
        }
    });

    socket.on('refreshCommodities', async (userId) => {
        const user = await db.User.findByPk(userId);
        const REFRESH_COST = 500;

        if (user.balance < REFRESH_COST) {
            return socket.emit('refreshResult', { success: false, message: 'Insufficient balance.' });
        }

        try {
            await db.sequelize.transaction(async (t) => {
                user.balance -= REFRESH_COST;
                await user.save({ transaction: t });
                gameState.players[userId].balance = user.balance;

                const allCommodities = await db.Commodity.findAll();
                for (let i = 0; i < 5; i++) {
                    const randomCommodity = allCommodities[Math.floor(Math.random() * allCommodities.length)];
                    const inventory = await db.Inventory.findOne({ where: { UserId: userId, CommodityId: randomCommodity.id }, transaction: t });
                    if (inventory) {
                        inventory.quantity += 1;
                        await inventory.save({ transaction: t });
                    } else {
                        await db.Inventory.create({ UserId: userId, CommodityId: randomCommodity.id, quantity: 1 }, { transaction: t });
                    }
                    gameState.players[userId].inventory[randomCommodity.id] = (gameState.players[userId].inventory[randomCommodity.id] || 0) + 1;
                }
            });

            broadcastGameState();
            socket.emit('refreshResult', { success: true, message: 'You received 5 new items!' });

        } catch (error) {
            socket.emit('refreshResult', { success: false, message: 'An error occurred.' });
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