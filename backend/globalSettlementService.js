const db = require('./db');

const PROGRESSIVE_PRICE_BASE = 250;
const TOP_PLAYER_BONUS_THRESHOLD = 10000;
const TOP_PLAYER_BONUS_MULTIPLIER = 0.2;
const TOP_PLAYER_BONUS_FLAT_ADDITION = 3000;

async function performGlobalSettlement(io, gameState, broadcastGameState) {
    console.log('[GlobalSettlement] Starting global settlement cycle...');
    const allUsers = await db.User.findAll();
    if (allUsers.length === 0) {
        console.log('[GlobalSettlement] No users found to settle.');
        return;
    }

    // Phase 1: Standard Settlement for all users
    console.log('[GlobalSettlement] Phase 1: Performing standard settlement for all users...');
    io.emit('settlement-phase-1-start');
    for (const user of allUsers) {
        const transaction = await db.sequelize.transaction();
        try {
            let totalPayout = 0;
            const userInventories = await db.Inventory.findAll({
                where: { UserId: user.id, quantity: { [db.Sequelize.Op.gt]: 0 } },
                transaction,
            });

            if (userInventories.length > 0) {
                for (const item of userInventories) {
                    let payoutForItem = 0;
                    for (let i = 1; i <= item.quantity; i++) {
                        payoutForItem += i * PROGRESSIVE_PRICE_BASE;
                    }
                    totalPayout += payoutForItem;
                    item.quantity = 0;
                    await item.save({ transaction });
                }
            }
            
            user.balance += totalPayout;
            await user.save({ transaction });
            await transaction.commit();
            console.log(`[GlobalSettlement] Standard settlement for user #${user.id} complete. Payout: $${totalPayout}. New balance: $${user.balance}`);

            // Update in-memory gameState for connected players
            if (gameState.players[user.id]) {
                gameState.players[user.id].balance = user.balance;
                // Clear inventory in gameState
                for (const item of userInventories) {
                    gameState.players[user.id].inventory[item.CommodityId] = 0;
                }
            }

        } catch (error) {
            await transaction.rollback();
            console.error(`[GlobalSettlement] Standard settlement for user #${user.id} FAILED.`, error);
        }
    }
    io.emit('settlement-phase-1-complete');

    // Phase 2: Apply special rules for Top 3
    console.log('[GlobalSettlement] Phase 2: Applying special rules for Top 3...');
    io.emit('settlement-phase-2-start');
    const top3Users = await db.User.findAll({
        order: [['balance', 'DESC']],
        limit: 3,
    });

    for (const user of top3Users) {
        if (user.balance > TOP_PLAYER_BONUS_THRESHOLD) {
            const oldBalance = user.balance;
            const newBalance = (oldBalance * TOP_PLAYER_BONUS_MULTIPLIER) + TOP_PLAYER_BONUS_FLAT_ADDITION;
            user.balance = newBalance;
            await user.save();
            console.log(`[GlobalSettlement] Applied Top 3 rule to user #${user.id}. Old balance: $${oldBalance}, New balance: $${newBalance}`);

            // Update in-memory gameState for connected players
            if (gameState.players[user.id]) {
                gameState.players[user.id].balance = user.balance;
            }

        } else {
            console.log(`[GlobalSettlement] User #${user.id} is in Top 3 but balance is not > ${TOP_PLAYER_BONUS_THRESHOLD}. No rule applied.`);
        }
    }
    io.emit('settlement-phase-2-complete');

    // Phase 3: Generate final leaderboard and broadcast
    console.log('[GlobalSettlement] Phase 3: Broadcasting final leaderboard...');
    io.emit('settlement-phase-3-start');
    const finalLeaderboard = await db.User.findAll({
        order: [['balance', 'DESC']],
        limit: 3,
        attributes: ['id', 'username', 'balance'], // Only send necessary data
    });

    io.emit('global-settlement-complete', {
        leaderboard: finalLeaderboard.map(u => u.toJSON()),
        timestamp: new Date(),
    });
    console.log('[GlobalSettlement] Cycle complete. Leaderboard broadcasted.');
    io.emit('settlement-phase-3-complete');

    broadcastGameState(); // Broadcast the updated gameState to all clients
}

module.exports = { performGlobalSettlement };
