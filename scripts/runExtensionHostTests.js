const { runTests } = require('@vscode/test-electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
(async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'sql-crack-host-'));
  const workspace = path.join(temporary, 'workspace');
  fs.mkdirSync(path.join(workspace, '.vscode'), {recursive: true});
  fs.writeFileSync(path.join(workspace, '.vscode/settings.json'), JSON.stringify({'sqlCrack.additionalFileExtensions': ['.hql']}));
  fs.writeFileSync(path.join(workspace, 'query.hql'), 'SELECT id FROM customers');
  fs.writeFileSync(path.join(workspace, 'query.sql'), 'SELECT total FROM orders');
  try {
    await runTests({
      version: process.env.VSCODE_TEST_VERSION || 'stable',
      ...(process.env.VSCODE_TEST_EXECUTABLE ? {vscodeExecutablePath: process.env.VSCODE_TEST_EXECUTABLE} : {}),
      extensionDevelopmentPath: path.resolve(__dirname, '..'),
      extensionTestsPath: path.resolve(__dirname, '../tests/extension-host/index.js'),
      launchArgs: [workspace, '--goto', path.join(workspace, 'query.hql'), '--disable-extensions', '--skip-welcome', '--skip-release-notes', '--user-data-dir', path.join(temporary, 'profile')]
    });
  } finally {fs.rmSync(temporary, {recursive: true, force: true});}
})().catch(error => {console.error(error); process.exitCode = 1;});
