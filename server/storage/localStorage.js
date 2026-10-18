// Append-only local JSON-lines storage for session bundles.
// Original uploaded files are also copied under received-files/ for easy access.

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "data"));
const DATA_FILE = path.join(DATA_DIR, "logs.jsonl");

let writeQueue = Promise.resolve();

async function ensureDataFile() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  try {
    await fsp.access(DATA_FILE);
  } catch {
    await fsp.writeFile(DATA_FILE, "", { flag: "a" });
  }
}

function safeRelativePath(filename) {
  if (typeof filename !== "string" || !filename || filename.includes("\\") || filename.includes("\0")) {
    return false;
  }
  return filename.split("/").every((part) => part && part !== "." && part !== "..");
}

async function appendSessionBundle(bundle) {
  await ensureDataFile();
  const receivedAt = new Date().toISOString();
  const files = Array.isArray(bundle.files) ? bundle.files : [];
  const sessionKey = crypto.createHash("sha256").update(bundle.sessionId).digest("hex");
  const uploadKey = `${receivedAt.replace(/[:.]/g, "-")}-${crypto.randomUUID()}`;
  const uploadDir = path.join(DATA_DIR, "received-files", sessionKey, uploadKey);
  const normalizedNames = new Set();

  const savedFiles = files.map((file) => {
    if (!file || !safeRelativePath(file.filename) || typeof file.content !== "string") {
      throw new Error("Session contains a file with an invalid path or content.");
    }
    const encoding = file.encoding || "utf8";
    if (encoding !== "utf8" && encoding !== "base64") {
      throw new Error("Session contains a file with an unsupported encoding.");
    }
    const normalized = file.filename.toLowerCase();
    if (normalizedNames.has(normalized)) throw new Error("Session contains duplicate file paths.");
    normalizedNames.add(normalized);

    const destination = path.resolve(uploadDir, ...file.filename.split("/"));
    const relative = path.relative(uploadDir, destination);
    if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
      throw new Error("Session file path escapes the upload folder.");
    }
    return {
      ...file,
      encoding,
      storedPath: path.relative(DATA_DIR, destination).split(path.sep).join("/"),
    };
  });

  try {
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      const destination = path.resolve(uploadDir, ...file.filename.split("/"));
      await fsp.mkdir(path.dirname(destination), { recursive: true });
      await fsp.writeFile(destination, Buffer.from(file.content, file.encoding || "utf8"), { flag: "wx" });
    }

    const record = { ...bundle, files: savedFiles, receivedAt };
    const line = `${JSON.stringify(record)}\n`;
    writeQueue = writeQueue.catch(() => {}).then(() => fsp.appendFile(DATA_FILE, line));
    await writeQueue;
    return record;
  } catch (err) {
    await fsp.rm(uploadDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}

async function readAllSessionBundles() {
  await ensureDataFile();
  await writeQueue.catch(() => {});
  const raw = await fsp.readFile(DATA_FILE, "utf-8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

module.exports = { appendSessionBundle, readAllSessionBundles };
