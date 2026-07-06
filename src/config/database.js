const { Sequelize } = require('sequelize');

function createSequelize() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required. Copy .env.example to .env and fill it in.');
  }

  return new Sequelize(databaseUrl, {
    dialect: 'postgres',
    logging: process.env.DB_LOGGING === 'true' ? console.log : false,
  });
}

module.exports = { createSequelize };
