const db = require('./db');

/**
 * 统一的用户初始化函数：设置余额和分配卡牌
 * @param {object} user - The Sequelize user object.
 * @param {object} options - 配置选项
 * @param {number} [options.initialBalance] - 初始余额（如果提供，则设置用户余额；如果不提供，则使用用户当前余额）
 * @param {object} [options.transaction] - Sequelize事务对象（可选）
 * @returns {Promise<{initialBalance: number, inventory: Array<{commodityId: number, quantity: number}>}>}
 */
async function initializeUserState(user, options = {}) {
    const { initialBalance, transaction } = options;
    
    // 查询所有卡牌种类，如果提供了事务则在事务中查询
    const findAllOptions = transaction ? { transaction } : {};
    const allCommodities = await db.Commodity.findAll(findAllOptions);
    const initialInventory = [];
    
    // 如果提供了初始余额，则设置用户余额
    if (initialBalance !== undefined) {
        user.balance = initialBalance;
        await user.save({ transaction });
    }
    
    // 固定总数量，种类分布随机
    const TOTAL_CARDS = 10; // 每个玩家初始固定发放10张卡牌
    const cardDistribution = {}; // 记录每种卡牌的数量
    
    // 初始化所有卡牌数量为0
    for (const commodity of allCommodities) {
        cardDistribution[commodity.id] = 0;
    }
    
    // 随机分配固定数量的卡牌到不同种类
    for (let i = 0; i < TOTAL_CARDS; i++) {
        const randomCommodity = allCommodities[Math.floor(Math.random() * allCommodities.length)];
        cardDistribution[randomCommodity.id]++;
    }
    
    // 创建库存记录
    for (const commodity of allCommodities) {
        const quantity = cardDistribution[commodity.id];
        if (quantity > 0) {
            await db.Inventory.create({ 
                UserId: user.id, 
                CommodityId: commodity.id, 
                quantity: quantity 
            }, { transaction });
            initialInventory.push({ commodityId: commodity.id, quantity });
        }
    }
    
    return { initialBalance: user.balance, inventory: initialInventory };
}

module.exports = { initializeUserState };

