const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const AdmZip = require('adm-zip');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'laa-test-'));
process.env.DATA_DIR = dataDir;
process.env.STORAGE_BACKEND = 'local';
const app = require('../index');
let server, base;
before(async () => { server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
after(async () => { await new Promise(r => server.close(r)); fs.rmSync(dataDir, { recursive: true, force: true }); });
const bundle = { sessionId: 'test-session', turns: [{ timestamp: '2026-10-07T09:00:00Z', role: 'student', message: 'Help with syntax' }] };
function archiveRequest(files) {
 const zip = new AdmZip(); for (const [name, content] of Object.entries(files)) zip.addFile(name, Buffer.from(typeof content === 'string' ? content : JSON.stringify(content)));
 const body = new FormData(); body.append('archive', new Blob([zip.toBuffer()]), 'session.zip'); return { method: 'POST', body };
}
test('JSON and ZIP requests persist chat turns', async () => {
 let r = await fetch(base + '/log', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(bundle) }); assert.equal(r.status, 201);
 r = await fetch(base + '/log', archiveRequest({ 'turns.json': bundle, 'execution_trace.json': [] })); assert.equal(r.status, 201);
 const logs = await (await fetch(base + '/logs')).json(); assert.equal(logs.length, 2); assert.deepEqual(logs[1].turns, bundle.turns);
});
test('rejects malformed and missing archive content', async () => {
 for (const files of [{}, { 'turns.json': '{' }, { 'turns.json': { sessionId: 'invalid', turns: [] } }]) assert.equal((await fetch(base + '/log', archiveRequest(files))).status, 400);
});

test('preserves extracted traces/files and rejects invalid archives without storing', async () => {
 const trace = [{ timestamp: '2026-10-07T09:00:00Z', code: 'print(1)', stdout: '1\n', exitCode: 0 }];
 assert.equal((await fetch(base + '/log', archiveRequest({ 'turns.json': bundle, 'execution_trace.json': trace, 'files/main.py': 'print(1)' }))).status, 201);
 const before = await (await fetch(base + '/logs')).json();
 assert.deepEqual(before.at(-1).executionTrace, trace); assert.deepEqual(before.at(-1).files, [{ filename: 'main.py', content: 'print(1)' }]);
 for (const files of [ { 'turns.json': bundle }, { 'turns.json': bundle, 'execution_trace.json': [{}] }, { 'turns.json': bundle, 'execution_trace.json': [], '../escape': 'bad' } ]) {
  assert.equal((await fetch(base + '/log', archiveRequest(files))).status, 400);
 }
 assert.equal((await (await fetch(base + '/logs')).json()).length, before.length);
});

test('inspector reports raw counts and filters sessions', async () => {
 const data = await (await fetch(base + '/inspect?sessionId=test-session')).json();
 assert.equal(data.totalBundles, 3); assert.equal(data.totalTurns, 3); assert.equal(data.totalExecutionTraces, 1);
 assert.equal(data.sessions.at(-1).executionTrace[0].stdout, '1\n');
 const empty = await (await fetch(base + '/inspect?sessionId=missing')).json(); assert.equal(empty.totalBundles, 0);
});

test('archive limits reject excessive expansion and entry counts', () => {
 const { decodeSessionArchive } = require('../archive');
 const large = new AdmZip();
 large.addFile('turns.json', Buffer.from(JSON.stringify(bundle)));
 large.addFile('execution_trace.json', Buffer.from('[]'));
 large.addFile('files/large.txt', Buffer.alloc(21 * 1024 * 1024, 65));
 assert.throws(() => decodeSessionArchive(large.toBuffer()), /20 MiB/);
 const many = new AdmZip();
 for (let i = 0; i < 101; i++) many.addFile(`files/${i}.txt`, Buffer.from('x'));
 assert.throws(() => decodeSessionArchive(many.toBuffer()), /100 entries/);
});

test('oversized uploads return JSON errors without storage', async () => {
 const before = (await (await fetch(base + '/logs')).json()).length;
 const body = new FormData(); body.append('archive', new Blob([Buffer.alloc(11 * 1024 * 1024)]), 'large.zip');
 const response = await fetch(base + '/log', { method: 'POST', body });
 assert.equal(response.status, 413); assert.match((await response.json()).error, /oversized/);
 assert.equal((await (await fetch(base + '/logs')).json()).length, before);
});
