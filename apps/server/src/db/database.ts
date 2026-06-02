import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type DatabaseConnection = Database.Database;

function resolveSchemaPath(): string {
  const candidates = [
    path.resolve(__dirname, 'schema.sql'),
    path.resolve(process.cwd(), 'src', 'db', 'schema.sql'),
    path.resolve(process.cwd(), 'apps', 'server', 'src', 'db', 'schema.sql'),
  ];

  const schemaPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!schemaPath) {
    throw new Error(`Unable to find database schema. Checked: ${candidates.join(', ')}`);
  }

  return schemaPath;
}

export function openDatabase(databasePath: string): DatabaseConnection {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  db.pragma('foreign_keys = ON');
  const schema = fs.readFileSync(resolveSchemaPath(), 'utf8');
  db.exec(schema);
  return db;
}
