require('dotenv').config();

const { createApp } = require('./src/app');
const { createSequelize } = require('./src/config/database');
const { initModels } = require('./src/models');

async function main() {
  const sequelize = createSequelize();
  const models = initModels(sequelize);

  await sequelize.authenticate();

  if (process.env.DB_SYNC === 'true') {
    await sequelize.sync();
  }

  const app = createApp({ models });
  const port = Number(process.env.PORT || 3001);

  app.listen(port, () => {
    console.log(`Voice AI MVP listening on http://localhost:${port}`);
  });
}

main().catch((err) => {
  console.error('Failed to start Voice AI MVP:', err);
  process.exit(1);
});
