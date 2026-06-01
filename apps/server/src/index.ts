import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { openDatabase } from './db/database.js';
import { RunQueue } from './queue/runQueue.js';
import { RunWorker } from './worker/runWorker.js';

const config = loadConfig();
const db = openDatabase(config.databasePath);
const worker = new RunWorker({ db, artifactsDir: config.artifactsDir });
const runQueue = new RunQueue(worker, config.maxConcurrency);
const app = await buildApp({ db, runQueue });

await app.listen({ host: config.host, port: config.port });
