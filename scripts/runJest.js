const { spawnSync } = require('child_process');
const os = require('os');
const path = require('path');

const jestBin = require.resolve('jest/bin/jest');
const localStorageFile = path.join(os.tmpdir(), 'sql-crack-localstorage');

const existingNodeOptions = process.env.NODE_OPTIONS || '';
const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
const hasLocalStorageOption = existingNodeOptions
  .split(/\s+/)
  .some((opt) => /^--localstorage-file(?:=|$)/.test(opt));
const nextNodeOptions = (hasLocalStorageOption || nodeMajor < 22)
  ? existingNodeOptions
  : [existingNodeOptions, `--localstorage-file=${localStorageFile}`].filter(Boolean).join(' ');

const result = spawnSync(process.execPath, [jestBin, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_OPTIONS: nextNodeOptions
  }
});

if (result.error) {
  console.error('Failed to spawn Jest:', result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
