import pino from 'pino';
import path from 'path';
import fs from 'fs';

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

export const logger = pino(
  { level: 'info' },
  pino.transport({
    targets: [
      { target: 'pino-pretty', options: { colorize: true }, level: 'info' },
      { target: 'pino/file', options: { destination: path.join(dataDir, 'bot.log') }, level: 'info' },
    ],
  })
);
