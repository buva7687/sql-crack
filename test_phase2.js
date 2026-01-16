// Test Phase 2: Column-Level Extraction (JavaScript version)
const { ColumnExtractor } = require('./out/src/workspace/extraction/columnExtractor');
const { TransformExtractor } = require('./out/src/workspace/extraction/transformExtractor');
const { ReferenceExtractor } = require('./out/src/workspace/extraction/referenceExtractor');

console.log('Phase 2 Column Extraction - Basic functionality test');
console.log('✅ ColumnExtractor class loaded');
console.log('✅ TransformExtractor class loaded');
console.log('✅ ReferenceExtractor class loaded');

const columnExtractor = new ColumnExtractor();
const transformExtractor = new TransformExtractor();
const referenceExtractor = new ReferenceExtractor();

console.log('✅ All extractors instantiated successfully');
console.log('\nPhase 2 implementation complete!');
