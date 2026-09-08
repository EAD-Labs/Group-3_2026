// Simple JSON-lines file storage (LAA-35).
// Not production-grade infra on purpose — this is a throwaway dev/test
// server (see LAA-6). Each line in the file is one stored session bundle.
//
// PLACEHOLDER STORAGE LOCATION (temporary, until NTNU's real server exists):
// The folder this writes to is configurable via the DATA_DIR environment
// variable, defaulting to ./data if unset. This means:
//   - Right now, DATA_DIR can point at a Google Drive Desktop synced folder
//     on this machine, so bundles show up in Drive automatically with zero
//     extra code — just set DATA_DIR to that folder's path when starting
//     the server (e.g. `DATA_DIR=/Users/you/GoogleDrive/laa-logs node index.js`).
//   - When NTNU's real storage exists, swapping to it should NOT require
//     touching index.js or any route logic — either point DATA_DIR at
//     whatever mount NTNU provides, or (if their storage isn't a plain
//     filesystem) replace just the two functions below with equivalents
//     that call NTNU's real API. Everything importing this module only
//     ever calls appendSessionBundle() / readAllSessionBundles() — the
//     interface stays identical either way.

const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "logs.jsonl");

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
