// LAA-6: throwaway local/dev test server.
// NTNU hosts the real production server — this is only for the team to
// develop and pilot against. No auth, no retention policy, no dashboard.

const express = require("express");
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
app.post("/log", (req, res) => {
  const errors = validateSessionBundle(req.body);
  if (errors.length > 0) {
    console.log("Rejected /log payload:", errors);
    return res.status(400).json({ error: "Invalid payload", details: errors });
  }

  console.log(
    `Received session bundle: sessionId=${req.body.sessionId}, turns=${req.body.turns.length}`
  );

  const stored = appendSessionBundle(req.body); // LAA-35
  res.status(201).json({ status: "stored", receivedAt: stored.receivedAt });
});

// LAA-37: internal debug listing only — not for the professor, no auth/pagination.
app.get("/logs", (req, res) => {
  const all = readAllSessionBundles();
  res.json(all);
});

app.listen(PORT, () => {
  console.log(`LAA test server listening on http://localhost:${PORT}`);
});
