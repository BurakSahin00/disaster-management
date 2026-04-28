// src/server.ts
import { app } from './app';
import { config } from './config';
import { createServer } from 'http';
import { realtimeHub } from './realtime/ws';

const server = createServer(app);
realtimeHub.attach(server);

server.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
