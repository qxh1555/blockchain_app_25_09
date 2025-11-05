
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const RedemptionRule = sequelize.define('RedemptionRule', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    reward: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    // Foreign key for one-to-one relationship with User
    UserId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true, // Ensures one rule per user
      references: {
        model: 'Users',
        key: 'id',
      },
    },
  });

  return RedemptionRule;
};
