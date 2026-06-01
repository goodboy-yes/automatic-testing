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
  ensureColumn(db, 'test_run_cases', 'run_order', 'INTEGER NOT NULL DEFAULT 0');
  return db;
}

function ensureColumn(db: DatabaseConnection, tableName: string, columnName: string, definition: string) {
  const columns = db.pragma(`table_info(${tableName})`) as Array<{ name: string }>;
  if (columns.some((column) => column?.name === columnName)) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}
