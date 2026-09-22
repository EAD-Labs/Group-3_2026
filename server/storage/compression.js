// compression.js
//
// Chat transcripts can get large (many turns, attached file content per
// turn). Rather than storing/uploading raw JSON text, we gzip it first.
// Plain Node.js (zlib) — no extra dependencies.

const zlib = require("zlib");

/**
 * Turn a JS object into a compressed Buffer, ready to write to disk or
 * upload somewhere.
 */
function compressJson(obj) {
  const jsonText = JSON.stringify(obj);
  return zlib.gzipSync(jsonText);
}

/**
 * Reverse of compressJson: takes a gzip-compressed Buffer and returns the
 * original JS object back.
 */
function decompressJson(buffer) {
  const jsonText = zlib.gunzipSync(buffer).toString("utf-8");
  return JSON.parse(jsonText);
}

module.exports = { compressJson, decompressJson };
