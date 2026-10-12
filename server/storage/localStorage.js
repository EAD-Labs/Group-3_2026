// Append-only local JSON-lines storage for session bundles.
// Original uploaded files are also copied under received-files/ for easy access.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "data"));
const DATA_FILE = path.join(DATA_DIR, "logs.jsonl");

function ensureDataFile() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "");
}

function safeRelativePath(filename) {
  if (typeof filename !== "string" || !filename || filename.includes("\\") || filename.includes("\0")) {
    return false;
  }
  return filename.split("/").every((part) => part && part !== "." && part !== "..");
}

function appendSessionBundle(bundle) {
  ensureDataFile();
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
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, Buffer.from(file.content, file.encoding || "utf8"), { flag: "wx" });
    }

    const record = { ...bundle, files: savedFiles, receivedAt };
    fs.appendFileSync(DATA_FILE, `${JSON.stringify(record)}\n`);
    return record;
  } catch (err) {
    fs.rmSync(uploadDir, { recursive: true, force: true });
    throw err;
  }
}

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
