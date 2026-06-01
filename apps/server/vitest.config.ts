import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export default defineConfig({
  resolve: {
    alias: {
      '@automatic-testing/shared': path.resolve(rootDir, 'packages/shared/src/index.ts'),
      '@automatic-testing/midscene-runner': path.resolve(rootDir, 'packages/midscene-runner/src/index.ts'),
    },
  },
});
