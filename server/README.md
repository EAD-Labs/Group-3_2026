# LAA Ingestion, Unpacking & Telemetry Server (`server` branch)

The server-side ingestion service for **Guarded Tutor (Learning-Aware AI)**. It accepts compressed `.zip` session archives (`POST /log`) uploaded by student VS Code extensions at assignment completion or startup, validates archive safety and schema rules, extracts student code snapshots into an organized disk hierarchy, and exposes inspection endpoints (`GET /inspect`, `GET /logs`) for instructors and researchers.

---

## Repository Branch Structure

| Branch | Purpose |
| :--- | :--- |
| **`master`** | Student-side VS Code Extension (`src/`, `media/`, `demo/`, `.vsix` packaging). |
| **`server`** *(this branch)* | Server-side `.zip` ingestion, validation, disk extraction, telemetry inspector, and Docker containerization (`server/`). |
| **`prompt-testbench`** | Guarded Prompt Evaluation Suite (`v1`–`v8` prompts, 34-case test catalog, judge rubric, and evaluation logs). |

---

## Quick Start

### Option 1: Docker Compose (Recommended for Reproducible Deployment)
```bash
cd server
docker compose up --build -d
curl http://localhost:3000/
```
- Runs as a non-root user inside an Alpine Node 20 container.
- Binds port `0.0.0.0:3000:3000` so student devices on the network/LAN/Tailscale can reach `http://<server-host>:3000/log`.
- Persists all session logs (`logs.jsonl`) and extracted code snapshots (`received-files/`) in the named Docker volume `session-data`.
- `docker compose down` stops the container while keeping stored student data; `docker compose down --volumes` deletes stored data.

### Option 2: Native Node.js (18+)
```bash
cd server
npm install
npm start
```
- Listens on `http://0.0.0.0:3000` by default (override via `HOST` and `PORT` environment variables, e.g., `PORT=8000 npm start`).
- Run the automated test suite (`6/6` integration & security tests):
  ```bash
  npm test
  ```

---

## API Endpoints

### 1. `GET /` — Health Check
Returns service status:
```json
{ "status": "ok", "service": "laa-test-server" }
```

### 2. `POST /log` — Session Archive Ingestion (Multipart `.zip` or JSON)
Accepts a `multipart/form-data` upload with the compressed session `.zip` in the `archive` field (the format sent by the VS Code extension), or a raw JSON session bundle.

```bash
curl -F archive=@session.zip http://localhost:3000/log
```
- **Success Response (`201 Created`):**
  ```json
  { "status": "stored", "receivedAt": "2026-10-18T12:53:50.739Z" }
  ```
- **Validation & Security Limits:**
  - Maximum compressed upload size: **`25 MiB`** (`HTTP 413` if exceeded).
  - Maximum uncompressed archive size: **`50 MiB`** (`HTTP 400` if exceeded).
  - Maximum archive entry count: **`2,000` entries** (`HTTP 400` if exceeded).
  - Path traversal protection: Rejects absolute paths, Windows drive letters, null bytes, `.` / `..` segments, duplicate paths, or files outside `files/`.
  - Required archive files: `turns.json` and `execution_trace.json`.

### 3. `GET /inspect` — Telemetry Summary & Session Inspector
Returns aggregated counts and unpacked session records. Supports optional filtering via `?sessionId=<id>`:
```bash
curl http://localhost:3000/inspect
curl "http://localhost:3000/inspect?sessionId=assignment-1-session"
```
Response shape:
```json
{
  "totalBundles": 1,
  "totalTurns": 6,
  "totalExecutionTraces": 0,
  "sessions": [
    {
      "sessionId": "assignment-1-session",
      "receivedAt": "2026-10-18T12:53:50.739Z",
      "turnCount": 6,
      "executionTrace": [],
      "files": [
        {
          "filename": "turn-0-0_main.py",
          "encoding": "utf8",
          "content": "...",
          "storedPath": "received-files/<sha256(sessionId)>/<ISO-timestamp>-<UUID>/turn-0-0_main.py"
        }
      ],
      "turns": [
        {
          "timestamp": "2026-10-18T12:53:38.451Z",
          "role": "student",
          "message": "In Python, what is the syntax difference between `=` and `+=` inside a loop?",
          "attachedFiles": [{ "filename": "demo/python-score-report/main.py", "language": "python" }]
        }
      ]
    }
  ]
}
```

### 4. `GET /logs` — Raw Stored Session Bundles
Returns the full array of stored session records from `logs.jsonl`:
```bash
curl http://localhost:3000/logs
```

---

## Disk Storage Layout (`local` Backend)

By default (`STORAGE_BACKEND=local`), the server writes to `server/storage/data/` (or the path specified by `DATA_DIR`):

```text
server/storage/data/
├── logs.jsonl
└── received-files/
    └── <sha256(sessionId)>/
        └── <ISO-timestamp>-<bundleUUID>/
            ├── turn-0-0_main.py
            └── turn-4-0_main.py
```

- **`logs.jsonl`**: Append-only JSON Lines file where each line is a complete validated session bundle record. Writes are serialized through an asynchronous in-process queue so concurrent class-deadline submissions never interleave or block the Node.js event loop.
- **`received-files/<sha256(sessionId)>/<ISO-timestamp>-<bundleUUID>/`**: Every uploaded `.zip` extracts its `files/*` snapshots into a unique, collision-free directory grouped by the SHA-256 hash of `sessionId`. Even if a student device submits multiple batches under the same `sessionId`, each upload gets its own timestamped UUID subfolder so files are never overwritten.

---

## Verified Stress-Test Benchmarks

Tested across separate client and server machines over the network:
- **150 Simultaneous Class-Deadline Submissions:** `150 / 150` succeeded in `2.03s` (`p50 = 669ms`, `p95 = 1.18s`, `max = 2.02s`), `0` corrupted lines in `logs.jsonl`, `450 / 450` code files extracted.
- **400-Turn Marathon Session (`19.55 MiB` uncompressed, 100 code snapshots):** Compressed to `183.5 KiB` on the client, uploaded and extracted 100 files onto server disk in `1.46s`.
- **Same-`sessionId` Parallel Burst (10 concurrent batches):** `10 / 10` stored into 10 distinct `<timestamp>-<UUID>` folders with `0` file overwrites.
- **Adversarial & Corrupt Load (corrupt ZIP, `../` traversal, `>2000` entries, invalid schema, `>25 MiB` upload):** `100%` rejected (`400`/`413`) with zero impact on concurrent valid student uploads.
