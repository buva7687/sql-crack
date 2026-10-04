const vscode = require('vscode');
const assert = require('assert');
exports.run = async () => {
  const extension = vscode.extensions.getExtension('buvan.sql-crack');
  assert(extension, 'Development extension is installed');
  const root = vscode.workspace.workspaceFolders[0].uri;
  const hql = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(root, 'query.hql'));
  await vscode.window.showTextDocument(hql);
  const deadline = Date.now() + 15000;
  while (!extension.isActive && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
  assert(extension.isActive, 'Custom-extension activation works before opening a .sql file');
  await vscode.commands.executeCommand('sql-crack.visualize');
  const sql = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(root, 'query.sql'));
  await vscode.languages.setTextDocumentLanguage(sql, 'plaintext');
  await vscode.window.showTextDocument(sql);
  await vscode.commands.executeCommand('sql-crack.visualize');
  assert.strictEqual(extension.packageJSON.capabilities.untrustedWorkspaces.supported, true);
  assert.strictEqual(extension.packageJSON.engines.vscode, '^1.85.0');
  const {Worker} = require('worker_threads');
  const path = require('path');
  await new Promise((resolve, reject) => {
    const worker = new Worker(path.join(extension.extensionPath, 'dist/workspace.worker.js'));
    let heartbeats = 0;
    const pulse = setInterval(() => heartbeats++, 5);
    const timeout = setTimeout(() => {worker.terminate(); clearInterval(pulse); reject(new Error('Workspace worker smoke timed out'));}, 10000);
    worker.once('error', error => {clearInterval(pulse); clearTimeout(timeout); reject(error);});
    worker.once('message', message => {
      clearInterval(pulse); clearTimeout(timeout); worker.terminate();
      try {assert.strictEqual(message.result.references.length, 10000); assert(heartbeats > 0, 'Host event loop remains responsive'); resolve();}
      catch (error) {reject(error);}
    });
    worker.postMessage({sql: 'SELECT 1 FROM ' + Array.from({length: 10000}, (_, index) => 'table_' + index).join(', '), filePath: '/synthetic.sql', dialect: 'PostgreSQL'});
  });
  console.log('SQL Crack extension-host smoke checks passed');
};
