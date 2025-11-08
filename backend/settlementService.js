const db = require('./db');

const SETTLEMENT_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes
const TICKER_INTERVAL_MS = 30 * 1000; // 30 seconds
const PROGRESSIVE_PRICE_BASE = 250;

/**
 * Starts a global ticker to check for users needing settlement.
 * @param {object} io - The Socket.IO instance.
 * @param {object} connectedUsersRef - A reference to the connectedUsers object from index.js
 * @param {Function} broadcastGameState - Function to broadcast the entire game state.
 */
function startSettlementTicker(io, connectedUsersRef, broadcastGameState, gameState) {
    console.log('[Settlement] Starting settlement ticker...');

    const performSettlement = async (user) => {
        console.log(`[Settlement] Starting settlement for user #${user.id}...`);
        const transaction = await db.sequelize.transaction();
        try {
            // 保存当前余额
            const currentBalance = user.balance;
            
            // 计算卡牌总得分
            // 规则：初始单价100，每多拥有一张单价+50
            let cardTotalScore = 0;
            const userInventories = await db.Inventory.findAll({
                where: { UserId: user.id, quantity: { [db.Sequelize.Op.gt]: 0 } },
                transaction,
            });

            if (userInventories.length > 0) {
                for (const inventoryItem of userInventories) {
                    // 对于每种卡牌，计算总得分
                    // 第1张：100，第2张：150 (100+50)，第3张：200 (100+50*2)，...
                    let scoreForItem = 0;
                    const quantity = inventoryItem.quantity;
                    for (let i = 0; i < quantity; i++) {
                        scoreForItem += 100 + 50 * i;
                    }
                    cardTotalScore += scoreForItem;
                    inventoryItem.quantity = 0;
                    await inventoryItem.save({ transaction });
                }
            }

            // 玩家得分 = 余额 + 卡牌总得分
            const finalScore = currentBalance + cardTotalScore;
            console.log(`[Settlement] User #${user.id} balance: $${currentBalance}, card score: $${cardTotalScore}, final score: $${finalScore}.`);

            user.balance = finalScore;
            user.nextSettlementAt = new Date(Date.now() + SETTLEMENT_INTERVAL_MS);
            await user.save({ transaction });

            await transaction.commit();
            console.log(`[Settlement] Successfully settled for user #${user.id}. New balance: $${user.balance}`);

            // Update the global game state immediately
            const playerState = gameState.players[user.id];
            if (playerState) {
                playerState.balance = user.balance;
                for (const inventoryItem of userInventories) {
                    if (playerState.inventory[inventoryItem.CommodityId]) {
                        playerState.inventory[inventoryItem.CommodityId] = 0;
                    }
                }
            }
            broadcastGameState();

            // Notify the specific user if they are online
            const userSocket = connectedUsersRef[user.id];
            if (userSocket) {
                userSocket.emit('settlementComplete', {
                    success: true,
                    message: `Settlement complete! You earned $${cardTotalScore.toFixed(2)} from cards.`,
                    cardScore: cardTotalScore,
                    newBalance: user.balance
                });
            }

        } catch (error) {
            await transaction.rollback();
            console.error(`[Settlement] FAILED to settle for user #${user.id}. Error:`, error);
            try {
                // If settlement fails, try again in 1 minute to avoid getting stuck
                const nextAttemptTime = new Date(Date.now() + 1 * 60 * 1000);
                await user.update({ nextSettlementAt: nextAttemptTime });
            } catch (updateError) {
                console.error(`[Settlement] FAILED to update next settlement time for user #${user.id} after error.`, updateError);
            }
        }
    };

    setInterval(async () => {
        try {
            // console.log('[Settlement] Ticker running: Checking for users to settle...');
            const usersToSettle = await db.User.findAll({
                where: {
                    nextSettlementAt: { [db.Sequelize.Op.lte]: new Date() }
                }
            });

            if (usersToSettle.length > 0) {
                console.log(`[Settlement] Found ${usersToSettle.length} user(s) to settle.`);
                for (const user of usersToSettle) {
                    await performSettlement(user);
                }
            }
        } catch (error) {
            console.error('[Settlement] Error in settlement ticker:', error);
        }
    }, TICKER_INTERVAL_MS);
}

module.exports = { startSettlementTicker };
