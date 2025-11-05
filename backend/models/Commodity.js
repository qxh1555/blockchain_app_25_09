
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Commodity = sequelize.define('Commodity', {
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    imageUrl: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  });

  return Commodity;
};
