
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const RuleItem = sequelize.define('RuleItem', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    // Foreign key to RedemptionRule
    RedemptionRuleId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'RedemptionRules',
        key: 'id',
      },
    },
    // Foreign key to Commodity
    CommodityId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Commodities',
        key: 'id',
      },
    },
  });

  return RuleItem;
};
