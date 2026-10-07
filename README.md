# Guarded Tutor — VS Code Extension

AI tutor chat panel for intro programming students at NTNU.

## Status
Base extension scaffolded (LAA-8) — TypeScript project set up with `yo code`, 
builds via webpack, verified running in the Extension Development Host.

## Setup
1. `npm install`
2. Press F5 in VS Code to launch the Extension Development Host
3. In the dev host window, run "Hello World" from the Command Palette to verify it works

## Next up
- Sidebar chat panel UI
- Relevant file detection logic

## Build an installable extension (LAA-54)

Use Node.js 22 or newer. Run `npm ci`, then `npm run package:vsix`.
The command runs the production webpack build through `vscode:prepublish`
and writes `artifacts/guarded-tutor-<version>.vsix`. Install it in VS Code
with **Extensions → … → Install from VSIX**. The existing VS Code engine
requirement in `package.json` still applies. Server code, logs, source files,
and previous packages are excluded from the distribution.
