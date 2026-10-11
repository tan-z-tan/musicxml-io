// Suitable for import('musicxml-io/abc') when ABC is only needed on demand.
export { parseAbc, parseAbcTunes } from './importers/abc';
export { serializeAbc, serializeAbcTunes } from './exporters/abc';
export type { AbcSerializeOptions } from './exporters/abc';
export type { Score } from './types';
