// Compare parser and Workspace extraction behavior against a saved release snapshot.
// node scripts/differential-probe.js --root /tmp/release-tree --output /tmp/baseline.json
// node scripts/differential-probe.js --compare /tmp/baseline.json --output /tmp/current.json
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const args = process.argv.slice(2);
const options = {};
for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    if (!['--root', '--output', '--compare'].includes(flag) || !args[index + 1]) {
        throw new Error('Use --root <checkout>, --output <snapshot.json>, --compare <baseline.json>');
    }
    options[flag.slice(2)] = args[index + 1];
}
if (!options.output) {
    throw new Error('--output <snapshot.json> is required');
}

const root = path.resolve(options.root || path.join(__dirname, '..'));
// Use the same logger adapter as the production Workspace worker. This keeps
// the probe independent of the VS Code extension host.
require.extensions['.ts'] = (module, filename) => {
    const sourceFile = filename === path.join(root, 'src/logger.ts')
        ? path.join(root, 'src/workspace/workerLogger.ts')
        : filename;
    const source = fs.readFileSync(sourceFile, 'utf8');
    const compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
        fileName: sourceFile,
    });
    module._compile(compiled.outputText, filename);
};

const { parseSqlBatch } = require(path.join(root, 'src/webview/sqlParser.ts'));
const { normalizeDialect } = require(path.join(root, 'src/shared/dialect.ts'));
const { SchemaExtractor, ReferenceExtractor } = require(path.join(root, 'src/workspace/extraction/index.ts'));
const manifest = require(path.join(root, 'package.json'));
const baseline = options.compare ? JSON.parse(fs.readFileSync(options.compare, 'utf8')) : undefined;
const dialects = baseline?.dialects || [...new Set(
    manifest.contributes.configuration.properties['sqlCrack.defaultDialect'].enum.map(normalizeDialect)
)];
const files = baseline?.files || fs.readdirSync(path.join(root, 'examples'))
    .filter(file => file.endsWith('.sql')).sort();
const schemaExtractor = new SchemaExtractor();
const referenceExtractor = new ReferenceExtractor();
const cases = {};
// Geometry can change without changing the SQL graph's semantics. Preserve
// source ranges, relation identities, joins, writes, lineage, hints and errors.
const geometryFields = new Set(['x', 'y', 'width', 'height', 'columnPositions']);
function serialize(_key, value) {
    if (geometryFields.has(_key)) return undefined;
    if (value instanceof Map) return [...value.entries()];
    if (value instanceof Set) return [...value];
    return value;
}
for (const file of files) {
    const sql = fs.readFileSync(path.join(root, 'examples', file), 'utf8');
    for (const dialect of dialects) {
        cases[`${file}/${dialect}`] = JSON.parse(JSON.stringify({
            flow: parseSqlBatch(sql, dialect),
            definitions: schemaExtractor.extractDefinitionsWithStatus(sql, file, dialect),
            references: referenceExtractor.extractReferencesWithStatus(sql, file, dialect),
        }, serialize));
    }
}
fs.writeFileSync(options.output, JSON.stringify({ dialects, files, cases }, null, 2) + '\n');
console.log(`Recorded ${Object.keys(cases).length} cases across ${files.length} files and ${dialects.length} dialects.`);
if (baseline) {
    const changed = Object.keys(cases).filter(key => JSON.stringify(cases[key]) !== JSON.stringify(baseline.cases[key]));
    for (const key of changed) console.log(`Changed ${key}`);
    console.log(`${changed.length} changed cases. Snapshots written for inspection.`);
    if (changed.length) process.exitCode = 1;
}
