// LAA-6: throwaway local/dev test server.
// NTNU hosts the real production server — this is only for the team to
// develop and pilot against. No auth, no retention policy, no dashboard.

const express = require("express");
const multer = require("multer");
const AdmZip = require("adm-zip");
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 1 } });
const { validateSessionBundle } = require("./validation");
const { appendSessionBundle, readAllSessionBundles } = require("./storage");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "10mb" })); // transcripts can carry attached file content

// LAA-32: basic health check.
app.get("/", (req, res) => {
  res.json({ status: "ok", service: "laa-test-server" });
});

// LAA-33 (updated for the finalized LAA-2 batch model) + LAA-34 validation.
// The extension now sends ONE bundle per (assignment, student) at the
// assignment deadline: { sessionId, turns: [...] } — not one turn per call.
app.post("/log", upload.single("archive"), async (req, res) => {
  if (req.is("multipart/form-data")) {
    if (!req.file) return res.status(400).json({ error: "Expected ZIP in archive field." });
    try {
      const zip = new AdmZip(req.file.buffer);
      const turnsFile = zip.getEntry("turns.json");
      if (!turnsFile) throw new Error("Archive must contain turns.json.");
      const payload = JSON.parse(turnsFile.getData().toString("utf8"));
      req.body = Array.isArray(payload) ? { sessionId: req.body.sessionId, turns: payload } : payload;
    } catch (err) {
      return res.status(400).json({ error: "Invalid session archive", details: [err.message] });
    }
  }
  const errors = validateSessionBundle(req.body);
  if (errors.length > 0) {
    console.log("Rejected /log payload:", errors);
    return res.status(400).json({ error: "Invalid payload", details: errors });
  }

  console.log(
    `Received session bundle: sessionId=${req.body.sessionId}, turns=${req.body.turns.length}`
  );

  try {
    const stored = await appendSessionBundle(req.body); // LAA-35
    res.status(201).json({ status: "stored", receivedAt: stored.receivedAt });
  } catch (err) {
    console.error("Storage error:", err.message);
    res.status(500).json({ error: "Failed to store session bundle." });
  }
});

// LAA-37: internal debug listing only — not for the professor, no auth/pagination.
app.get("/logs", async (req, res) => {
  try {
    const all = await readAllSessionBundles();
    res.json(all);
  } catch (err) {
    console.error("Storage read error:", err.message);
    res.status(500).json({ error: "Failed to read session bundles." });
  }
});

// Catch malformed JSON bodies (bad syntax, not just missing fields) and
// respond with the same clean error shape as everything else, instead of
// Express's default HTML stack-trace page.
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Malformed JSON in request body." });
  }
  if (err instanceof multer.MulterError || err.type === "entity.too.large") {
    return res.status(err.code === "LIMIT_FILE_SIZE" || err.type === "entity.too.large" ? 413 : 400)
      .json({ error: "Invalid or oversized upload." });
  }
  next(err);
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`LAA test server listening on http://localhost:${PORT}`);
  });
}
module.exports = app;
