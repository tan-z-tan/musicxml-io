// Full entry point (Node.js).
// Everything except file I/O lives in ./browser, which is also published as
// the browser-safe build (no `fs` import) via the "browser" condition in
// package.json "exports".
export * from './browser';

// File operations (Node.js only)
export { parseFile, serializeToFile, decodeBuffer } from './file';
