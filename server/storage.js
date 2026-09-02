// Simple JSON-lines file storage (LAA-35).
// Not production-grade infra on purpose — this is a throwaway dev/test
// server (see LAA-6). Each line in the file is one stored session bundle.

const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "data", "logs.jsonl");

function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, "");
  }
}

// Persist one accepted session bundle (LAA-2 batch payload: sessionId + turns[]).
function appendSessionBundle(bundle) {
  ensureDataFile();
  const record = {
    receivedAt: new Date().toISOString(),
    sessionId: bundle.sessionId,
    turns: bundle.turns,
  };
  fs.appendFileSync(DATA_FILE, JSON.stringify(record) + "\n");
  return record;
}

// Read back every stored session bundle (LAA-37 debug endpoint).
function readAllSessionBundles() {
  ensureDataFile();
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

module.exports = { appendSessionBundle, readAllSessionBundles };
