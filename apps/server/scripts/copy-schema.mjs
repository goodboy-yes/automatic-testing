import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const source = resolve('src', 'db', 'schema.sql');
const target = resolve('dist', 'db', 'schema.sql');

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
