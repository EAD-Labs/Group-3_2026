const AdmZip = require("adm-zip");
const { validateSessionBundle } = require("./validation");

const MAX_BYTES = 50 * 1024 * 1024;
const MAX_ENTRIES = 2000;

function isSafeArchivePath(name, isDirectory) {
  if (!name || name.startsWith("/") || name.includes("\\") || name.includes("\0")) return false;
  if (/^[A-Za-z]:/.test(name)) return false;
  const parts = (isDirectory ? name.replace(/\/$/, "") : name).split("/");
  return parts.every((part) => part && part !== "." && part !== "..");
}

// Decode into records first. The storage layer writes under its own data directory.
function decodeSessionArchive(buffer, sessionId) {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  if (entries.length > MAX_ENTRIES) throw new Error(`Archive exceeds ${MAX_ENTRIES} entries.`);

  let total = 0;
  const names = new Set();
  const files = [];
  for (const entry of entries) {
    const name = entry.entryName;
    if (!isSafeArchivePath(name, entry.isDirectory)) throw new Error("Archive contains an unsafe path.");
    if (names.has(name)) throw new Error("Archive contains duplicate paths.");
    names.add(name);
    total += entry.header.size;
    if (total > MAX_BYTES) throw new Error("Uncompressed archive exceeds 50 MiB.");

    if (!entry.isDirectory && name !== "turns.json" && name !== "execution_trace.json") {
      if (!name.startsWith("files/") || name.split("/").length < 2) {
        throw new Error("Additional files must be under files/.");
      }
      const data = entry.getData();
      const text = data.toString("utf8");
      const isUtf8 = Buffer.from(text, "utf8").equals(data);
      files.push({
        filename: name.slice("files/".length),
        content: isUtf8 ? text : data.toString("base64"),
        encoding: isUtf8 ? "utf8" : "base64",
      });
    }
  }

  if (!names.has("turns.json") || !names.has("execution_trace.json")) {
    throw new Error("Archive requires turns.json and execution_trace.json.");
  }

  const turns = JSON.parse(zip.getEntry("turns.json").getData().toString("utf8"));
  const bundle = Array.isArray(turns) ? { sessionId, turns } : turns;
  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) {
    throw new Error("turns.json must be a bundle or turns array.");
  }
  if (Array.isArray(turns) && !sessionId) {
    throw new Error("A sessionId form field is required when turns.json contains an array.");
  }

  bundle.executionTrace = JSON.parse(zip.getEntry("execution_trace.json").getData().toString("utf8"));
  bundle.files = files;
  const errors = validateSessionBundle(bundle);
  if (errors.length) throw new Error(errors.join(" "));
  return bundle;
}

module.exports = { decodeSessionArchive };
