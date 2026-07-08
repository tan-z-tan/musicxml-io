import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    browser: 'src/browser.ts',
    'accessors/index': 'src/entry-accessors.ts',
    'operations/index': 'src/operations/index.ts',
    'query/index': 'src/query/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: true,
  sourcemap: false,
  clean: true,
});
