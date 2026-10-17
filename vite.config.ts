import { defineConfig } from 'vitest/config';
import { shareMeta } from './scripts/share-meta';
import { PERSONAL } from './src/config/personal';

export default defineConfig({
  base: './',
  build: { target: 'es2020', assetsInlineLimit: 0 },
  plugins: [
    {
      // Link-preview tags (Open Graph / Twitter) with absolute URLs for the deployed site.
      name: 'love-crush-share-meta',
      transformIndexHtml: (html) => html.replace('<!-- share-meta -->', shareMeta(PERSONAL, process.env)),
    },
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 60_000,
  },
});
