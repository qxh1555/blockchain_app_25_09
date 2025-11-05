const { Sequelize } = require('sequelize');

// PLEASE REPLACE with your actual database credentials
const sequelize = new Sequelize('bc_db', 'root', '123456', {
  host: 'localhost',
  dialect: 'mysql',
});

const User = require('./models/user')(sequelize);
const Commodity = require('./models/Commodity')(sequelize);
const Inventory = require('./models/Inventory')(sequelize);
const Trade = require('./models/Trade')(sequelize);

// User-Inventory relationship
User.hasMany(Inventory);
Inventory.belongsTo(User);

// Commodity-Inventory relationship
Commodity.hasMany(Inventory);
Inventory.belongsTo(Commodity);

// User-Trade relationships
User.hasMany(Trade, { as: 'SentTrades', foreignKey: 'fromUserId' });
User.hasMany(Trade, { as: 'ReceivedTrades', foreignKey: 'toUserId' });
Trade.belongsTo(User, { as: 'FromUser', foreignKey: 'fromUserId' });
Trade.belongsTo(User, { as: 'ToUser', foreignKey: 'toUserId' });

// Commodity-Trade relationship
Trade.belongsTo(Commodity, { foreignKey: 'commodityId' });

const db = {
  sequelize,
  Sequelize,
  User,
  Commodity,
  Inventory,
  Trade, // Add Trade to the exported db object
};

module.exports = db;