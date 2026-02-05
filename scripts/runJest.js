const { spawnSync } = require('child_process');
const os = require('os');
const path = require('path');

const jestBin = require.resolve('jest/bin/jest');
const localStorageFile = path.join(os.tmpdir(), 'sql-crack-localstorage');

const existingNodeOptions = process.env.NODE_OPTIONS || '';
const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
const hasLocalStorageOption = existingNodeOptions.split(/\s+/).some((opt) => opt.startsWith('--localstorage-file'));
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

process.exit(result.status ?? 1);
