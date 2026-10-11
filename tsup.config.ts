import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    browser: 'src/browser.ts',
    core: 'src/core.ts',
    musicxml: 'src/entry-musicxml.ts',
    'musicxml-compressed': 'src/entry-musicxml-compressed.ts',
    abc: 'src/entry-abc.ts',
    midi: 'src/exporters/midi.ts',
    file: 'src/file.ts',
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
