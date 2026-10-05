const fs = require('fs');
const path = require('path');
const lock = require('../package-lock.json');
const stats = JSON.parse(fs.readFileSync(process.argv[2] || path.resolve(__dirname, '../webpack-stats.json'), 'utf8'));
const bundled = new Set();
function collect(module) {
  for (const match of (module.name || '').matchAll(/node_modules\/(?:@[^/]+\/)?[^/]+/g)) bundled.add(match[0]);
  (module.modules || []).forEach(collect);
}
(stats.children || [stats]).forEach(child => (child.modules || []).forEach(collect));
const sections = ['SQL Crack — Third-Party Notices\n\nDependency license texts for distributed runtime components. Optional jsPDF HTML dependencies are omitted from the webview build.'];
for (const [location, entry] of Object.entries(lock.packages)) {
  if (!bundled.has(location)) continue;
  const directory = path.resolve(__dirname, '..', location);
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  const licenses = fs.readdirSync(directory).filter(name => /^(licen[sc]e|copying|notice)(\.|$)/i.test(name) && fs.statSync(path.join(directory, name)).isFile());
  if (!licenses.length) throw new Error(`Missing license text: ${manifest.name}`);
  sections.push(`${'='.repeat(72)}\n${manifest.name} ${manifest.version} (${manifest.license || entry.license || 'see text'})\n${licenses.map(name => fs.readFileSync(path.join(directory, name), 'utf8')).join('\n')}`);
}
const notices = sections.join('\n\n') + '\n\n' + fs.readFileSync(path.resolve(__dirname, '../dist/webview.js.LICENSE.txt'), 'utf8');
fs.writeFileSync(path.resolve(__dirname, '../THIRD_PARTY_NOTICES.txt'), notices.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, ''));
