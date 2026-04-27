// src/server.ts
import { app } from './app';
import { config } from './config';

const server = app.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
});

process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
process.on('SIGINT', () => { server.close(() => process.exit(0)); });
