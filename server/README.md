# LAA Test/Local Server (LAA-6)

A throwaway local/dev server for the team to develop and pilot against
before NTNU's production API exists. **Not** the real production server —
NTNU hosts that. No auth, no retention policy, no dashboard by design
(see LAA-6 for full scope notes).

## Requirements

- Node.js 18+

## Run it

```bash
cd server
npm install
npm start
```

The server starts on **http://localhost:3000** by default. Override with
the `PORT` env var, e.g. `PORT=8000 npm start`.

You should see:

```
LAA test server listening on http://localhost:3000
```

## Endpoints

### `GET /`
Health check. Returns `{ "status": "ok", "service": "laa-test-server" }`.

### `POST /log`
Accepts one **session bundle** per (assignment, student) pair, sent once
at the assignment deadline (finalized batch model, see LAA-2):

```json
{
  "sessionId": "string — groups turns from one assignment window",
  "turns": [
    {
      "timestamp": "ISO 8601 string, UTC",
      "role": "student | assistant",
      "message": "string",
      "attachedFiles": [
        { "filename": "string", "content": "string" }
      ]
    }
  ]
}
```

Missing `sessionId`, an empty/missing `turns` array, or a turn missing a
required field returns `400` with details on what's wrong (LAA-34).
A valid bundle is appended to local storage and returns `201`.

### `GET /logs`
Internal debugging convenience only — lets the team eyeball whether data
landed correctly. Not for the professor, no auth or pagination (LAA-37).
Returns every stored session bundle as a JSON array.

## Storage

Session bundles go through a swappable storage layer under `storage/`, so
swapping in NTNU's real storage later doesn't require touching `index.js`
or any route — see `storage/index.js` for how it picks a backend.

Set `STORAGE_BACKEND` to choose (defaults to `local`):

- **`local`** (default) — appends JSON-lines to `storage/data/logs.jsonl`
  (created automatically). Override the folder with `DATA_DIR` — e.g.
  point it at a Google-Drive-Desktop-synced folder for a zero-code way to
  see stored bundles show up in your Drive.
- **`drive`** — uploads each session bundle straight to a Google Drive
  folder via the Drive API, gzip-compressed first (chat transcripts
  typically shrink 90%+). Needs one-time setup — see the comments at the
  top of `storage/driveStorage.js` for the exact steps (service account,
  API key, sharing a folder). **This backend hasn't been tested against
  real Drive yet — verify it works before relying on it**, since it was
  built without live credentials/network access.

Run with the Drive backend, once set up:
```bash
STORAGE_BACKEND=drive GOOGLE_SERVICE_ACCOUNT_KEY='...' GOOGLE_DRIVE_FOLDER_ID='...' npm start
```

### Swapping to NTNU's real server/storage later
Two options, neither touches `index.js`:
1. If it's filesystem-like: point `DATA_DIR` (local backend) at it.
2. Otherwise: add one new file (e.g. `storage/ntnuStorage.js`) implementing
   the same two functions (`appendSessionBundle`, `readAllSessionBundles`),
   add one case to `storage/index.js`, and set `STORAGE_BACKEND=ntnu`.

## Manual smoke test (LAA-38)

```bash
curl -X POST http://localhost:3000/log \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "assignment-1-session",
    "turns": [
      { "timestamp": "2026-09-02T10:00:00Z", "role": "student", "message": "How do I loop over a list in Python?" },
      { "timestamp": "2026-09-02T10:00:05Z", "role": "assistant", "message": "You can use a for loop, e.g. for item in my_list:" }
    ]
  }'

curl http://localhost:3000/logs
```

Confirm the bundle you sent shows up in the `GET /logs` response.
