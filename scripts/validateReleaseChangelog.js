const fs = require('fs');
const path = require('path');

function hasDatedReleaseEntry(changelog, version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    return false;
  }

  const prefix = `## [${version}] - `;
  const heading = changelog.split(/\r?\n/).find(line => line.startsWith(prefix));
  const releaseDate = heading?.slice(prefix.length);
  if (!releaseDate || !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) {
    return false;
  }

  const parsedDate = new Date(`${releaseDate}T00:00:00.000Z`);
  return Number.isFinite(parsedDate.getTime())
    && parsedDate.toISOString().slice(0, 10) === releaseDate;
}

if (require.main === module) {
  const version = process.argv[2];
  const changelog = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
  if (!hasDatedReleaseEntry(changelog, version)) {
    console.error(`CHANGELOG.md needs a dated ## [${version}] entry (YYYY-MM-DD) before publication.`);
    process.exitCode = 1;
  }
}

module.exports = { hasDatedReleaseEntry };
