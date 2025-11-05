
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Inventory = sequelize.define('Inventory', {
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  });

  return Inventory;
};
