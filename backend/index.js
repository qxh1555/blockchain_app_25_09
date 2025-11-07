const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const db = require('./db');
const fabricClient = require('./fabric_client');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*'
  },
});

app.use(cors());
app.use(express.json());

// API Routes for Authentication (using MySQL for user credentials only)
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).send('Username and password are required');
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await db.User.create({ username, password: hashedPassword });
    
    // Initialize user on blockchain with initial balance
    await fabricClient.initUser(user.id.toString(), 1000);
    
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
    console.error('Error logging in:', error);
    res.status(500).send('Error logging in');
  }
});


// --- Game Logic (WebSockets with Blockchain) ---
const commodities = [
    { id: '1', name: 'Gold', imageUrl: '/images/gold.png' },
    { id: '2', name: 'Silver', imageUrl: '/images/silver.png' },
    { id: '3', name: 'Crude Oil', imageUrl: '/images/oil.png' },
    { id: '4', name: 'Natural Gas', imageUrl: '/images/gas.png' },
    { id: '5', name: 'Corn', imageUrl: '/images/corn.png' },
    { id: '6', name: 'Wheat', imageUrl: '/images/wheat.png' },
    { id: '7', name: 'Coffee', imageUrl: '/images/coffee.png' },
    { id: '8', name: 'Sugar', imageUrl: '/images/sugar.png' },
];

let connectedUsers = {}; // Maps userId to socket
let gameState = {
    players: {},
    commodities: []
};
const userLocks = {}; // Lock map to prevent concurrent operations per user

// Helper function to retry blockchain operations on MVCC conflicts
async function retryOnMVCCConflict(operation, maxRetries = 3, delayMs = 100) {
    let lastError;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            if (error.transactionCode === 'MVCC_READ_CONFLICT' && attempt < maxRetries - 1) {
                console.log(`MVCC conflict detected, retrying... (attempt ${attempt + 1}/${maxRetries})`);
                // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, delayMs * Math.pow(2, attempt)));
                continue;
            }
            throw error;
        }
    }
    throw lastError;
}

const broadcastGameState = () => {
    io.emit('gameStateUpdate', gameState);
}

io.on('connection', (socket) => {
    console.log(`A user connected: ${socket.id}`);

    socket.on('playerReady', async (user) => {
        try {
            console.log(`Player ${user.username} (${user.id}) is ready`);
            connectedUsers[user.id] = socket;

            const userId = user.id.toString();

            // Get user data from blockchain
            let userAsset = await fabricClient.getUserAssets(userId);
            
            // If user doesn't exist on blockchain, initialize them
            if (!userAsset) {
                await fabricClient.initUser(userId, 100000);
                userAsset = await fabricClient.getUserAssets(userId);
            }

            // Get all commodities from blockchain
            const allCommodities = await fabricClient.getAllCommodities();

            // Initialize player state
            if (!gameState.players[user.id]) {
                gameState.players[user.id] = {
                    id: user.id,
                    username: user.username,
                    balance: userAsset.balance,
                    inventory: {},
                    redemptionRule: null
                };

                // Get current inventory from blockchain
                const inventory = await fabricClient.getAllInventory(userId);
                
                // If user has no inventory, give them random items
                if (inventory.length === 0) {
                    for (const commodity of allCommodities) {
                        const quantity = Math.floor(Math.random() * 10);
                        if (quantity > 0) {
                            await fabricClient.updateInventory(userId, commodity.commodityId, quantity, 'add');
                            gameState.players[user.id].inventory[commodity.commodityId] = quantity;
                        }
                    }
                } else {
                    // Load existing inventory
                    for (const item of inventory) {
                        gameState.players[user.id].inventory[item.commodityId] = item.quantity;
                    }
                }
            }

            // Get or create redemption rule
            let rule = await fabricClient.getRedemptionRule(userId);

            if (!rule) {
                const reward = Math.floor(Math.random() * 3001) + 2000;
                const numItems = Math.floor(Math.random() * 2) + 2;
                const shuffledCommodities = [...allCommodities].sort(() => 0.5 - Math.random());
                const selectedCommodities = shuffledCommodities.slice(0, numItems);
                
                const requiredItems = selectedCommodities.map(commodity => ({
                    commodityId: commodity.commodityId,
                    quantity: Math.floor(Math.random() * 7) + 1
                }));

                await fabricClient.createRedemptionRule(userId, requiredItems, reward);
                rule = await fabricClient.getRedemptionRule(userId);
            }

            // Transform rule to match frontend format
            if (rule) {
                const ruleItems = await Promise.all(rule.requiredItems.map(async item => {
                    const commodity = await fabricClient.getCommodity(item.commodityId);
                    return {
                        CommodityId: item.commodityId,
                        quantity: item.quantity,
                        Commodity: {
                            id: item.commodityId,
                            name: commodity.name,
                            imageUrl: commodity.metadata?.imageUrl || ''
                        }
                    };
                }));

                gameState.players[user.id].redemptionRule = {
                    id: rule.ruleId,
                    UserId: userId,
                    reward: rule.rewardAmount,
                    RuleItems: ruleItems
                };
            }

            // Get trade history from blockchain
            const tradeHistory = await fabricClient.getTradeHistory(userId);
            socket.emit('tradeHistory', tradeHistory);

            broadcastGameState();
        } catch (error) {
            console.error('Error in playerReady:', error);
            socket.emit('error', { message: 'Failed to initialize player' });
        }
    });

    socket.on('proposeTrade', async (tradeData) => {
        const { fromUserId, toUserId, tradeDetails, tradeId } = tradeData; 
        const toSocket = connectedUsers[toUserId];
        
        try {
            const fromUserIdStr = fromUserId.toString();
            const toUserIdStr = toUserId.toString();
            const commodityIdStr = tradeDetails.commodityId.toString();
            
            // Create trade on blockchain with retry mechanism
            await retryOnMVCCConflict(async () => {
                await fabricClient.createTrade(
                    tradeId,
                    fromUserIdStr,
                    toUserIdStr,
                    commodityIdStr,
                    tradeDetails.quantity,
                    tradeDetails.price,
                    tradeDetails.action
                );
            });
            
            if (toSocket) {
                toSocket.emit('tradeProposal', { fromUserId, toUserId, tradeDetails, tradeId });
            }
        } catch (error) {
            console.error('Failed to save trade proposal:', error);
            
            // Parse error message for user-friendly feedback
            let userMessage = 'Trade creation failed';
            const errorStr = error.message || '';
            
            if (error.transactionCode === 'MVCC_READ_CONFLICT') {
                userMessage = 'Transaction conflict. Please try again.';
            } else if (errorStr.includes('insufficient inventory')) {
                userMessage = 'Insufficient inventory - seller does not have enough items';
            } else if (errorStr.includes('insufficient funds')) {
                userMessage = 'Insufficient funds - buyer does not have enough money';
            } else if (errorStr.includes('does not exist')) {
                userMessage = 'User or commodity does not exist';
            } else if (errorStr.includes('already exists')) {
                userMessage = 'Trade already exists';
            } else {
                userMessage = errorStr;
            }
            
            socket.emit('tradeResult', { 
                success: false, 
                message: userMessage, 
                tradeId,
                errorType: errorStr.includes('insufficient inventory') ? 'INSUFFICIENT_INVENTORY' :
                          errorStr.includes('insufficient funds') ? 'INSUFFICIENT_FUNDS' : 'OTHER'
            });
        }
    });

    socket.on('tradeResponse', async (responseData) => {
        const { fromUserId, toUserId, accepted, tradeDetails, tradeId } = responseData;
        const fromSocket = connectedUsers[fromUserId];
        const toSocket = connectedUsers[toUserId];

        try {
            if (accepted) {
                // Execute trade on blockchain with retry mechanism
                await retryOnMVCCConflict(async () => {
                    await fabricClient.executeTrade(tradeId);
                });

                // Get updated trade status
                const trade = await fabricClient.getTradeStatus(tradeId);

                // Determine seller and buyer
                const { commodityId, quantity, price } = tradeDetails;
                const sellerId = tradeDetails.action === 'buy' ? toUserId : fromUserId;
                const buyerId = tradeDetails.action === 'buy' ? fromUserId : toUserId;

                // Update local game state from blockchain
                const sellerAsset = await fabricClient.getUserAssets(sellerId.toString());
                const buyerAsset = await fabricClient.getUserAssets(buyerId.toString());
                const sellerInventory = await fabricClient.getInventory(sellerId.toString(), commodityId.toString());
                const buyerInventory = await fabricClient.getInventory(buyerId.toString(), commodityId.toString());

                if (gameState.players[sellerId]) {
                    gameState.players[sellerId].balance = sellerAsset.balance;
                    gameState.players[sellerId].inventory[commodityId] = sellerInventory.quantity;
                }

                if (gameState.players[buyerId]) {
                    gameState.players[buyerId].balance = buyerAsset.balance;
                    gameState.players[buyerId].inventory[commodityId] = buyerInventory.quantity;
                }

                broadcastGameState();
                const result = { success: true, message: 'Trade successful', tradeId };
                if (fromSocket) fromSocket.emit('tradeResult', result);
                if (toSocket) toSocket.emit('tradeResult', result);

            } else {
                // Reject trade on blockchain with retry mechanism
                await retryOnMVCCConflict(async () => {
                    await fabricClient.rejectTrade(tradeId);
                });
                
                const result = { success: false, message: 'Trade rejected', tradeId };
                if (fromSocket) fromSocket.emit('tradeResult', result);
                if (toSocket) toSocket.emit('tradeResult', result);
            }
        } catch (error) {
            console.error('Error executing trade:', error);
            const message = error.transactionCode === 'MVCC_READ_CONFLICT'
                ? 'Transaction conflict. Please try again.'
                : error.message;
            const result = { success: false, message, tradeId };
            if (fromSocket) fromSocket.emit('tradeResult', result);
            if (toSocket) toSocket.emit('tradeResult', result);
        }
    });

    socket.on('redeem', async (userId) => {
        try {
            const userIdStr = userId.toString();
            
            // Get redemption rule from blockchain
            const rule = await fabricClient.getRedemptionRule(userIdStr);
            
            if (!rule) {
                return socket.emit('redeemResult', { success: false, message: 'No redemption rule found.' });
            }

            // Generate unique record ID
            const recordId = `redemption_${userId}_${Date.now()}`;

            // Execute redemption on blockchain with retry mechanism
            await retryOnMVCCConflict(async () => {
                await fabricClient.executeRedemption(userIdStr, recordId);
            });

            // Update local game state from blockchain
            const userAsset = await fabricClient.getUserAssets(userIdStr);
            const inventory = await fabricClient.getAllInventory(userIdStr);

            if (gameState.players[userId]) {
                gameState.players[userId].balance = userAsset.balance;
                gameState.players[userId].inventory = {};
                
                for (const item of inventory) {
                    gameState.players[userId].inventory[item.commodityId] = item.quantity;
                }
            }

            broadcastGameState();
            socket.emit('redeemResult', { success: true, message: `Redeemed for $${rule.rewardAmount}!` });

        } catch (error) {
            console.error('Error executing redemption:', error);
            const message = error.transactionCode === 'MVCC_READ_CONFLICT'
                ? 'Transaction conflict. Please try again.'
                : error.message;
            socket.emit('redeemResult', { success: false, message });
        }
    });

    socket.on('refreshCommodities', async (userId) => {
        const userIdStr = userId.toString();
        
        // Check if user already has a pending refresh operation
        if (userLocks[userIdStr]) {
            return socket.emit('refreshResult', { 
                success: false, 
                message: 'Please wait, previous operation is still processing.' 
            });
        }
        
        // Acquire lock for this user
        userLocks[userIdStr] = true;
        
        try {
            const REFRESH_COST = 500;

            // Get user balance from blockchain
            const userAsset = await fabricClient.getUserAssets(userIdStr);

            if (userAsset.balance < REFRESH_COST) {
                return socket.emit('refreshResult', { success: false, message: 'Insufficient balance.' });
            }

            // Deduct refresh cost with retry mechanism
            await retryOnMVCCConflict(async () => {
                await fabricClient.updateBalance(userIdStr, REFRESH_COST, 'subtract');
            });

            // Add 5 random commodities with retry mechanism
            const allCommodities = await fabricClient.getAllCommodities();
            for (let i = 0; i < 5; i++) {
                const randomCommodity = allCommodities[Math.floor(Math.random() * allCommodities.length)];
                await retryOnMVCCConflict(async () => {
                    await fabricClient.updateInventory(userIdStr, randomCommodity.commodityId, 1, 'add');
                });
            }

            // Update local game state from blockchain
            const updatedAsset = await fabricClient.getUserAssets(userIdStr);
            const inventory = await fabricClient.getAllInventory(userIdStr);

            if (gameState.players[userId]) {
                gameState.players[userId].balance = updatedAsset.balance;
                gameState.players[userId].inventory = {};
                
                for (const item of inventory) {
                    gameState.players[userId].inventory[item.commodityId] = item.quantity;
                }
            }

            broadcastGameState();
            socket.emit('refreshResult', { success: true, message: 'You received 5 new items!' });

        } catch (error) {
            console.error('Error refreshing commodities:', error);
            const message = error.transactionCode === 'MVCC_READ_CONFLICT' 
                ? 'Transaction conflict. Please try again.' 
                : 'An error occurred.';
            socket.emit('refreshResult', { success: false, message });
        } finally {
            // Release lock
            delete userLocks[userIdStr];
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


// Start the server
const PORT = process.env.PORT || 3001;
const startServer = async () => {
    try {
        // Initialize MySQL database (for user authentication only)
        await db.sequelize.sync({ alter: true });
        console.log('✓ Database synced successfully (authentication only).');

        // Connect to Fabric network
        await fabricClient.connect();
        console.log('✓ Connected to Fabric blockchain network.');

        // Initialize commodities on blockchain if needed
        for (const commodity of commodities) {
            await fabricClient.createCommodity(commodity.id, commodity.name, { imageUrl: commodity.imageUrl });
        }
        console.log('✓ Commodities initialized on blockchain.');

        // Load commodities from blockchain
        gameState.commodities = await fabricClient.getAllCommodities();
        console.log(`✓ Loaded ${gameState.commodities.length} commodities from blockchain.`);

        server.listen(PORT, () => {
            console.log(`\n========================================`);
            console.log(`✓ Server is listening on port ${PORT}`);
            console.log(`✓ Using Hyperledger Fabric for game data storage`);
            console.log(`========================================\n`);
        });
    } catch (error) {
        console.error('Unable to start server:', error);
        process.exit(1);
    }
};

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nShutting down gracefully...');
    await fabricClient.disconnect();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\nShutting down gracefully...');
    await fabricClient.disconnect();
    process.exit(0);
});

startServer();
