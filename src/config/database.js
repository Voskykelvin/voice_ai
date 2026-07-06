const { Sequelize } = require('sequelize');

function createSequelize() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required. Copy .env.example to .env and fill it in.');
  }

  const usesSsl = process.env.DB_SSL === 'true' || /[?&]sslmode=/.test(databaseUrl);

  return new Sequelize(databaseUrl, {
    dialect: 'postgres',
    logging: process.env.DB_LOGGING === 'true' ? console.log : false,
    dialectOptions: usesSsl
      ? {
          ssl: {
            require: true,
            rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false' ? false : true,
          },
        }
      : undefined,
  });
}

module.exports = { createSequelize };
