import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/app.ts', 'src/types/**', 'src/**/*.test.ts', 'dist'],
    },
  },
  resolve: {
    alias: {
      '@extriviate/shared': resolve(__dirname, '../shared/src/index.ts'),
    },
  },
});
