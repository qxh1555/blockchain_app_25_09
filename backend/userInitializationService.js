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

/**
 * 生成新的兑换规则（RedemptionRule）
 * @param {number} userId - 用户ID
 * @param {Array} allCommodities - 所有商品列表
 * @param {object} options - 配置选项
 * @param {object} [options.transaction] - Sequelize事务对象（可选）
 * @returns {Promise<object>} 生成的 RedemptionRule 对象（包含关联的 RuleItems 和 Commodities）
 */
async function generateRedemptionRule(userId, allCommodities, options = {}) {
    const { transaction } = options;
    
    // 选择两类商品，每类总共3~5个物品让玩家收集
    // 首先打乱商品列表以便随机选择
    const shuffledCommodities = allCommodities.sort(() => 0.5 - Math.random());
    // 随机选两种类型（两类商品，不重复）
    const numKinds = 2;
    const selectedKinds = shuffledCommodities.slice(0, numKinds);

    // 总的物品数量为3~5
    const totalItemsToCollect = Math.floor(Math.random() * 3) + 3; // 3~5
    // 每类至少1件，最多(totalItemsToCollect - (numKinds-1))
    // 先为每类分配最少1件
    let remaining = totalItemsToCollect - numKinds;
    let quantities = Array(numKinds).fill(1);
    // 随机分配剩余的物品
    for (let i = 0; i < remaining; i++) {
        const idx = Math.floor(Math.random() * numKinds);
        quantities[idx] += 1;
    }
    const reward = 100 + totalItemsToCollect * 175;
    const newRule = await db.RedemptionRule.create({ UserId: userId, reward }, { transaction });

    const ruleItems = [];
    for (let i = 0; i < numKinds; i++) {
        ruleItems.push({
            RedemptionRuleId: newRule.id,
            CommodityId: selectedKinds[i].id,
            quantity: quantities[i] // 每类需收集的数量
        });
    }
    await db.RuleItem.bulkCreate(ruleItems, { transaction });

    // 获取完整的 rule 数据（包含关联的 Commodity）
    const rule = await db.RedemptionRule.findOne({
        where: { id: newRule.id },
        include: [{ model: db.RuleItem, include: [db.Commodity] }]
    }, { transaction });

    return rule;
}

module.exports = { initializeUserState, generateRedemptionRule };

