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

  const server = app.listen(port, () => {
    console.log(`Voice AI MVP listening on http://localhost:${port}`);
  });

  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received; closing connections.`);
    const forceExit = setTimeout(() => process.exit(1), 10_000);
    forceExit.unref();
    server.close(async () => {
      try {
        await sequelize.close();
        clearTimeout(forceExit);
        process.exit(0);
      } catch (err) {
        console.error('Graceful shutdown failed:', err);
        process.exit(1);
      }
    });
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Failed to start Voice AI MVP:', err);
  process.exit(1);
});
