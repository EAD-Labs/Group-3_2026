# Two-device extension and ZIP demo

This demo sends synthetic chat history from the extension development host to
Garvit's local server implementation. Keep both devices on a trusted network;
the development server has no authentication.

## Server device

Use Garvit's `garvit/laa-server-packaging` branch, which contains the ZIP
receiver. From the repository root:

```powershell
git fetch origin
git switch --track origin/garvit/laa-server-packaging
cd server
npm ci
npm start
```

The server listens on port 3000 and Garvit's `app.listen(PORT)` accepts LAN
connections by default. Find the server device's LAN IPv4 address with
`ipconfig` on Windows, `ipconfig getifaddr en0` on macOS, or `hostname -I` on
Linux. Allow inbound TCP 3000 on the private network if its firewall prompts.
Keep both devices on the same non-guest Wi-Fi. From the student device, check
`http://<server-ip>:3000/` in a browser; the health check should return JSON
status `ok`.

## Student device

1. Open this repository in VS Code and run `npm install` if dependencies are
   not already installed. The **Run Extension** launch configuration uses an
   isolated user-data directory under `.vscode-test/`, so old histories and
   pending uploads from your normal VS Code profile are not sent.
2. Set **Guarded Tutor: Logging Server Url** to
   `http://<server-ip>:3000/log` in User or Workspace Settings.
3. Press F5 to launch the Extension Development Host. In that window, run
   **Guarded Tutor: Set Gemini API Key** from the Command Palette and enter your
   own key into VS Code's secret prompt. Do not put the key in this repository.
4. Open `demo/python-score-report/ASSIGNMENT.md` and `main.py`. Open the
   **Guarded Tutor** activity-bar view, ask a syntax-level question, then solve
   and run the script in the integrated terminal.
5. The demo uses its own already-expired session ID. After chatting, use
   **Developer: Reload Window** in the Extension Development Host. On
   activation, the extension packages the stored chat history into a ZIP and
   posts it to the configured server URL. Per the professor's direction, the
   demo stores no execution data; `execution_trace.json` is an empty
   compatibility entry.

## Verify receipt

On the server device, open `http://localhost:3000/inspect`. Confirm the demo
session is present with its chat turns and that the accepted upload contained
`execution_trace.json`. The server's default local-storage backend writes under
`server/storage/data/`.

The launch configuration gives the Extension Development Host its own
user-data directory, isolating this demo's chat history and retry queue from
your normal VS Code profile. That demo directory persists between launches;
clear it before a repeat demo if you need a fresh session. The student's LLM
API key remains in VS Code SecretStorage.
