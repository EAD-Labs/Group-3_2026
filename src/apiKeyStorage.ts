import * as vscode from 'vscode';

// Stored via VS Code's SecretStorage (OS keychain-backed), not settings.json
// or the repo, so the key never ends up in plaintext config or source control.
const API_KEY_SECRET_ID = 'guardedTutor.geminiApiKey';

export async function getApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
	return context.secrets.get(API_KEY_SECRET_ID);
}

export async function promptAndStoreApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
	const key = await vscode.window.showInputBox({
		title: 'Guarded Tutor: Gemini API Key',
		prompt: 'Enter your Gemini API key (from aistudio.google.com)',
		password: true,
		ignoreFocusOut: true,
	});
	if (!key) {
		return undefined;
	}
	await context.secrets.store(API_KEY_SECRET_ID, key);
	return key;
}
