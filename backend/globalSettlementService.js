const db = require('./db');
const { initializeUserState } = require('./userInitializationService');

const PROGRESSIVE_PRICE_BASE = 250;
const TOP_PLAYER_BONUS_THRESHOLD = 10000;
const TOP_PLAYER_BONUS_MULTIPLIER = 0.2;
const TOP_PLAYER_BONUS_FLAT_ADDITION = 3000;

// 用于存储排行榜快照的引用（从index.js传入）
let leaderboardSnapshotRef = null;

function setLeaderboardSnapshotRef(ref) {
    leaderboardSnapshotRef = ref;
}

async function performGlobalSettlement(io, gameState, broadcastGameState) {
    console.log('[GlobalSettlement] Starting global settlement cycle...');
    io.emit('settlement-start');

    const allUsers = await db.User.findAll();
    if (allUsers.length === 0) {
        console.log('[GlobalSettlement] No users found to settle.');
        return;
    }

    // 获取所有卡牌种类
    const allCommodities = await db.Commodity.findAll();
    const INITIAL_BALANCE = 2000.0; // 降低初始余额，确保玩家需要通过交易来提升得分

    // 用于保存排行榜快照的得分数据
    const scoreData = [];

    // 为每个用户在一个事务中完成所有结算操作：计算得分、清空库存、重新初始化
    for (const user of allUsers) {
        const transaction = await db.sequelize.transaction();
        try {
            // Step 1: 计算得分
            // 玩家得分 = 余额 + 卡牌总得分
            // 卡牌总得分计算规则：初始单价100，每多拥有一张单价+50
            const currentBalance = user.balance;
            let cardTotalScore = 0;
            const userInventories = await db.Inventory.findAll({
                where: { UserId: user.id, quantity: { [db.Sequelize.Op.gt]: 0 } },
                transaction,
            });

            if (userInventories.length > 0) {
                for (const item of userInventories) {
                    // 对于每种卡牌，计算总得分
                    const singlePrice = 100 + 50 * (item.quantity - 1)
                    cardTotalScore += item.quantity * singlePrice;
                }
            }

            // 玩家得分 = 余额 + 卡牌总得分
            const finalScore = currentBalance + cardTotalScore;
            user.balance = finalScore;
            await user.save({ transaction });

            // 保存得分数据用于排行榜（在事务提交前保存）
            scoreData.push({
                id: user.id,
                username: user.username,
                balance: finalScore,
            });

            // Step 2: 清空库存
            await db.Inventory.destroy({
                where: { UserId: user.id },
                transaction,
            });

            // Step 3: 重新初始化用户（设置余额和分配卡牌）
            const { initialBalance, inventory: initialInventory } = await initializeUserState(user, {
                initialBalance: INITIAL_BALANCE,
                transaction: transaction
            });

            // 提交事务
            await transaction.commit();
            console.log(`[GlobalSettlement] Settlement complete for user #${user.id}. Final Score: $${finalScore}, Reinitialized with balance $${initialBalance}`);

            // Update in-memory gameState for connected players
            if (gameState.players[user.id]) {
                gameState.players[user.id].balance = initialBalance;
                // Update inventory in gameState
                for (const commodity of allCommodities) {
                    const inventoryItem = initialInventory.find(item => item.commodityId === commodity.id);
                    gameState.players[user.id].inventory[commodity.id] = inventoryItem ? inventoryItem.quantity : 0;
                }
            }

        } catch (error) {
            await transaction.rollback();
            console.error(`[GlobalSettlement] Failed to settle user #${user.id}.`, error);
        }
    }

    // 保存排行榜快照（按得分排序）
    scoreData.sort((a, b) => b.balance - a.balance);
    if (leaderboardSnapshotRef) {
        leaderboardSnapshotRef.current = scoreData.map((u, index) => ({
            id: u.id,
            username: u.username,
            balance: u.balance,
            rank: index + 1,
        }));
        console.log('[GlobalSettlement] Leaderboard snapshot saved to memory.');
    }

    // 广播结算完成和排行榜
    const leaderboard = leaderboardSnapshotRef && leaderboardSnapshotRef.current
        ? leaderboardSnapshotRef.current
        : [];

    io.emit('global-settlement-complete', {
        leaderboard: leaderboard,
        timestamp: new Date(),
    });
    console.log('[GlobalSettlement] Settlement cycle complete. Leaderboard broadcasted.');

    broadcastGameState(); // Broadcast the updated gameState to all clients
}

module.exports = { performGlobalSettlement, setLeaderboardSnapshotRef };
