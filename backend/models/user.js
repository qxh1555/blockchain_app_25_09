
const { DataTypes } = require('sequelize');

// 用户初始余额常量
const INITIAL_BALANCE = 2000.0;

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    username: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    balance: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: INITIAL_BALANCE,
    },
  });

  return User;
};

// 导出初始余额常量供其他模块使用
module.exports.INITIAL_BALANCE = INITIAL_BALANCE;
