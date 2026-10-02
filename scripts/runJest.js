const { spawnSync } = require('child_process');

const jestBin = require.resolve('jest/bin/jest');
const wrapperArgs = process.argv.slice(2);
const exposeGcFlag = '--sql-crack-expose-gc';
const exposeGc = wrapperArgs.includes(exposeGcFlag);
const jestArgs = wrapperArgs.filter((arg) => arg !== exposeGcFlag);

const existingNodeOptions = process.env.NODE_OPTIONS || '';
const hasLocalStorageOption = existingNodeOptions
  .split(/\s+/)
  .some((opt) => /^--localstorage-file(?:=|$)/.test(opt));
const configuredLocalStorageFile = process.env.SQL_CRACK_JEST_LOCALSTORAGE_FILE || '';
const nextNodeOptions = (hasLocalStorageOption || !configuredLocalStorageFile)
  ? existingNodeOptions
  : [existingNodeOptions, `--localstorage-file=${configuredLocalStorageFile}`].filter(Boolean).join(' ');

const result = spawnSync(process.execPath, [...(exposeGc ? ['--expose-gc'] : []), jestBin, ...jestArgs], {
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
