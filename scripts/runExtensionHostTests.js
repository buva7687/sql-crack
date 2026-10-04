const { runTests, runVSCodeCommand } = require('@vscode/test-electron');
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
    const version = process.env.VSCODE_TEST_VERSION || 'stable';
    let developmentPath = path.resolve(__dirname, '..');
    const profile = path.join(temporary, 'profile');
    const extensionArgs = ['--disable-extensions'];
    if (process.env.VSCODE_TEST_VSIX) {
      const extensions = path.join(temporary, 'extensions');
      await runVSCodeCommand([
        '--install-extension', path.resolve(process.env.VSCODE_TEST_VSIX), '--force',
        '--extensions-dir', extensions, '--user-data-dir', profile
      ], {version, reuseMachineInstall: true});
      // Load SQL Crack from the installed VSIX, using a separate test driver.
      developmentPath = path.join(temporary, 'test-driver');
      fs.mkdirSync(developmentPath);
      fs.writeFileSync(path.join(developmentPath, 'package.json'), JSON.stringify({
        name: 'sql-crack-test-driver', publisher: 'test', version: '0.0.0',
        engines: {vscode: '^1.85.0'}, main: './extension.js', activationEvents: ['*'],
        capabilities: {untrustedWorkspaces: {supported: true}}
      }));
      fs.writeFileSync(path.join(developmentPath, 'extension.js'), 'exports.activate = () => {};');
      extensionArgs.splice(0, extensionArgs.length, '--extensions-dir', extensions);
    }
    const launchArgs = [workspace, '--goto', path.join(workspace, 'query.hql'), ...extensionArgs, '--skip-welcome', '--skip-release-notes', '--user-data-dir', profile];
    if (process.env.VSCODE_TEST_RESTRICTED === '1') {
      fs.mkdirSync(path.join(profile, 'User'), {recursive: true});
      fs.writeFileSync(path.join(profile, 'User/settings.json'), JSON.stringify({
        'security.workspace.trust.enabled': true,
        'security.workspace.trust.startupPrompt': 'never'
      }));
      // runTests disables Workspace Trust, so use the direct test-host launch
      // for this isolated untrusted workspace instead.
      const result = await runVSCodeCommand([
        ...launchArgs, '--extensionDevelopmentPath', developmentPath,
        '--extensionTestsPath', path.resolve(__dirname, '../tests/extension-host/index.js'),
        '--disable-updates', '--no-cached-data'
      ], {version, reuseMachineInstall: true});
      process.stdout.write(result.stdout);
      process.stderr.write(result.stderr);
    } else {
      await runTests({
        version,
        ...(process.env.VSCODE_TEST_EXECUTABLE ? {vscodeExecutablePath: process.env.VSCODE_TEST_EXECUTABLE} : {}),
        extensionDevelopmentPath: developmentPath,
        extensionTestsPath: path.resolve(__dirname, '../tests/extension-host/index.js'),
        launchArgs
      });
    }
  } finally {fs.rmSync(temporary, {recursive: true, force: true});}
})().catch(error => {console.error(error); process.exitCode = 1;});
