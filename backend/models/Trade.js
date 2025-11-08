
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Trade = sequelize.define('Trade', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    fromUserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users', // 'Users' is the table name for the User model
        key: 'id',
      },
    },
    toUserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id',
      },
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    price: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },
    action: {
      type: DataTypes.STRING, // 'buy' or 'sell'
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING, // 'pending', 'successful', 'failed', 'rejected'
      allowNull: false,
      defaultValue: 'pending',
    },
    message: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    onChain: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  });

  return Trade;
};
