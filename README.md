# Guarded Tutor (Learning-Aware AI) — VS Code Extension

A guarded AI programming tutor for introductory programming students at **NTNU**, developed by **ET617 Group 3** (Tejas Kulkarni, Tanvi Mundra, Garvit Garg, Lavanya Padole) under the guidance of **Prof. Kshitij Sharma**.

Guarded Tutor provides conceptual explanations, debugging guidance, and syntax scaffolding directly inside VS Code **without writing or giving away assignment solutions**, while transparently packaging anonymized chat transcripts and progressive student code snapshots into compressed `.zip` bundles for post-assignment learning analytics.

---

## Repository Branch Structure

This repository is organized into **three dedicated branches**:

| Branch | Purpose | Key Contents |
| :--- | :--- | :--- |
| **`master`** *(this branch)* | **Student-side VS Code Extension** | Extension UI (`src/extension.ts`), `v8` guarded prompt (`src/guardedModePrompt.ts`), Gemini & OpenAI-compatible LLM client (`src/llmClient.ts`), local session persistence & `.zip` batch uploader (`src/logging/`), demo workspace (`demo/`), and `.vsix` packaging (`npm run package:vsix`). |
| **`server`** | **Instructor Ingestion & Unpacking Server** | Express multipart `.zip` ingestion (`POST /log`), archive security validator (`server/archive.js`, `server/validation.js`), disk folder extraction (`server/storage/`), telemetry inspector (`GET /inspect`, `GET /logs`), and Docker deployment (`Dockerfile`, `compose.yaml`). |
| **`prompt-testbench`** | **Guarded Prompt Evaluation Suite** | Iterative prompt versions (`v1`–`v8`), 34-scenario adversarial & pedagogical test catalog (`catalog.json`), LLM-as-a-judge rubric, automated runner (`run.py`), and JSONL evaluation logs. |

---

## End-to-End Architecture & Data Flow

```text
+-----------------------------------------------------------------------------------+
|                        STUDENT DEVICE (VS Code Extension)                         |
|                                                                                   |
|  1. Active Editor Capture (src/messagePayload.ts)                                 |
|     Captures student question + active workspace file (filename, language, code)  |
|                                      |                                            |
|                                      v                                            |
|  2. Guarded LLM Engine (src/llmClient.ts + src/guardedModePrompt.ts [v8])         |
|     - Deduplicates unchanged historical file blocks to keep LLM context compact   |
|     - Enforces mandatory "AUDIT: ... FINAL_RESPONSE: ..." output format           |
|     - Strips private AUDIT reasoning before showing/logging the tutor response    |
|                                      |                                            |
|                                      v                                            |
|  3. Durable Session State & Packaging (src/logging/packageTurns.ts)               |
|     - Persists turns in VS Code workspaceState after every message                |
|     - Records distinct UTC ISO-8601 timestamps for every student & tutor turn     |
|                                      |                                            |
|                                      v                                            |
|  4. Client ZIP Compression & Deduplication (src/logging/compressSession.ts)       |
|     - Builds in-memory DEFLATE session.zip:                                       |
|         ├── turns.json                                                            |
|         ├── execution_trace.json                                                  |
|         └── files/turn-<turnIdx>-<fileIdx>_<filename> (deduplicated across turns) |
|                                      |                                            |
|                                      v                                            |
|  5. Multipart Upload + Offline Retry Queue (sendBatch.ts + runLoggingCheck.ts)    |
|     - Uploads session.zip via POST <loggingServerUrl> (field: "archive")          |
|     - 30s timeout + 3 retries with exponential backoff & random jitter            |
|     - Queues failed uploads in persistent workspaceState and flushes on launch    |
+-----------------------------------------------------------------------------------+
                                       |
                         HTTP POST /log (multipart/form-data)
                                       |
                                       v
+-----------------------------------------------------------------------------------+
|                         INSTRUCTOR SERVER (`server` branch)                       |
|                                                                                   |
|  - Validates ZIP structure, path safety, size caps (25 MiB ZIP / 50 MiB raw)      |
|  - Appends structured session record to storage/data/logs.jsonl (serialized I/O)  |
|  - Extracts student code snapshots into organized disk folders:                   |
|      storage/data/received-files/<sha256(sessionId)>/<ISO-timestamp-UUID>/        |
|  - Exposes GET /inspect (filtered telemetry summary) & GET /logs                  |
+-----------------------------------------------------------------------------------+
```

---

## Quick Start: Building & Installing the Extension (`.vsix`)

### Prerequisites
- **Node.js** `18+` and `npm`
- **Visual Studio Code** `1.95.0+`

### 1. Install Dependencies & Package `.vsix`
```bash
npm install
npm run pretest
npm run package:vsix
```
This compiles TypeScript, bundles the extension with Webpack in production mode, and outputs:
```text
artifacts/guarded-tutor-0.0.1.vsix
```

### 2. Install the `.vsix` in VS Code
- **Via VS Code UI:** Open the **Extensions** view (`Cmd+Shift+X` on macOS / `Ctrl+Shift+X` on Windows & Linux) $\rightarrow$ click the **`...`** menu at the top-right $\rightarrow$ **Install from VSIX...** $\rightarrow$ select `artifacts/guarded-tutor-0.0.1.vsix`.
- **Via CLI:**
  ```bash
  code --install-extension artifacts/guarded-tutor-0.0.1.vsix
  ```

---

## Extension Configuration

### Setting the Gemini API Key
1. Open the VS Code Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`).
2. Run **`Guarded Tutor: Set Gemini API Key`** and paste your Google AI Studio Gemini API key.
   - The key is stored securely in your operating system's credential store via VS Code `SecretStorage` (never written to plaintext settings files).
   - To remove a stored key, run **`Guarded Tutor: Clear Gemini API Key`**.

### Extension Settings (`settings.json` or VS Code Settings UI)

| Setting | Default | Description |
| :--- | :--- | :--- |
| `guardedTutor.provider` | `"gemini"` | AI backend provider: `"gemini"` (Google Gemini API) or `"openai-compatible"` (Ollama, vLLM, LM Studio, OpenRouter, etc.). |
| `guardedTutor.geminiModel` | `"gemini-3.5-flash-lite"` | Gemini model identifier used when `provider` is `"gemini"`. |
| `guardedTutor.customEndpoint` | `"http://localhost:11434/v1"` | Base URL for OpenAI-compatible `/chat/completions` when `provider` is `"openai-compatible"`. |
| `guardedTutor.customModel` | `"llama3.1"` | Model name sent to the custom endpoint. |
| `guardedTutor.customApiKey` | `""` | Optional Bearer token for the custom OpenAI-compatible endpoint. |
| `guardedTutor.loggingServerUrl` | `"http://localhost:3000/log"` | Full `POST /log` URL of the instructor's LAA ingestion server (e.g., `http://<server-host>:3000/log`). |

---

## Running an End-to-End Demo

A self-contained demo workspace is included in `demo/python-score-report/main.py` (see `demo/README.md` for detailed presenter steps):

1. **Start the Ingestion Server** (from the `server` branch):
   ```bash
   git checkout server
   cd server && npm install && npm start
   # Or via Docker: docker compose up --build -d
   ```
2. **Configure the Student Extension:**
   - Set `guardedTutor.loggingServerUrl` to `http://<server-ip>:3000/log` (or `http://localhost:3000/log` if running on the same machine).
   - Set your Gemini API key via **`Guarded Tutor: Set Gemini API Key`**.
3. **Solve the Demo Assignment with Guarded Tutor:**
   - Open `demo/python-score-report/main.py` in VS Code so it is the active editor tab.
   - Click the **Guarded Tutor** icon in the Activity Bar.
   - Ask a direct solution-seeking question (e.g., *"Can you write the complete code for this file?"*) — verify that the tutor invisibly withholds the solution and provides conceptual guidance instead.
   - Edit `main.py` and ask a follow-up question.
4. **Trigger Session Packaging & ZIP Upload:**
   - Click **`+` (New Chat)** in the Guarded Tutor panel header (or reload the window to trigger `runLoggingCheckOnLaunch`).
5. **Verify on the Server:**
   - Open `http://<server-ip>:3000/inspect` to view the unpacked turns, per-turn timestamps, and extracted `storedPath` references under `server/storage/data/received-files/`.

---

## Development Scripts

| Script | Command | Description |
| :--- | :--- | :--- |
| `npm run compile` | `webpack` | Bundles the extension into `dist/extension.js`. |
| `npm run watch` | `webpack --watch` | Rebuilds automatically on source file changes. |
| `npm run compile-tests` | `tsc -p . --outDir out` | Compiles TypeScript modules into `out/` for testing. |
| `npm run lint` | `eslint src` | Runs ESLint across `src/`. |
| `npm run pretest` | `compile-tests && compile && lint` | Full verification check before packaging or committing. |
| `npm run package:vsix` | `vsce package --out artifacts/ ...` | Produces an installable `.vsix` package in `artifacts/`. |
