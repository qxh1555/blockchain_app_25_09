const { Sequelize } = require('sequelize');

const sequelize = new Sequelize('bc_db', 'root', '123456', {
  host: 'localhost',
  dialect: 'mysql',
  logging: false, // Disable logging
});

const User = require('./models/user')(sequelize);

const db = {
  sequelize,
  Sequelize,
  User,
};

module.exports = db;
