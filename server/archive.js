const AdmZip = require('adm-zip');
const { validateSessionBundle } = require('./validation');
const MAX_BYTES = 20 * 1024 * 1024;

// Decode into storage records; never extract untrusted paths onto the filesystem.
function decodeSessionArchive(buffer, sessionId) {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  if (entries.length > 100) throw new Error('Archive exceeds 100 entries.');
  let total = 0;
  const names = new Set();
  const files = [];
  for (const entry of entries) {
    const name = entry.entryName;
    if (name.startsWith('/') || name.includes('\\') || name.split('/').some(part => part === '..' || part === '.') || /^[A-Za-z]:/.test(name)) {
      throw new Error('Archive contains an unsafe path.');
    }
    if (names.has(name)) throw new Error('Archive contains duplicate paths.');
    names.add(name);
    total += entry.header.size;
    if (total > MAX_BYTES) throw new Error('Uncompressed archive exceeds 20 MiB.');
    if (!entry.isDirectory && name !== 'turns.json' && name !== 'execution_trace.json') {
      if (!name.startsWith('files/')) throw new Error('Additional files must be under files/.');
      files.push({ filename: name.slice(6), content: entry.getData().toString('utf8') });
    }
  }
  if (!names.has('turns.json') || !names.has('execution_trace.json')) {
    throw new Error('Archive requires turns.json and execution_trace.json.');
  }
  const turns = JSON.parse(zip.getEntry('turns.json').getData().toString('utf8'));
  const bundle = Array.isArray(turns) ? { sessionId, turns } : turns;
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) throw new Error('turns.json must be a bundle or turns array.');
  bundle.executionTrace = JSON.parse(zip.getEntry('execution_trace.json').getData().toString('utf8'));
  bundle.files = files;
  const errors = validateSessionBundle(bundle);
  if (errors.length) throw new Error(errors.join(' '));
  return bundle;
}
module.exports = { decodeSessionArchive };
