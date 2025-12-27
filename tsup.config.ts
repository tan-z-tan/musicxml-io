import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'accessors/index': 'src/accessors/index.ts',
    'operations/index': 'src/operations/index.ts',
    'query/index': 'src/query/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
});
