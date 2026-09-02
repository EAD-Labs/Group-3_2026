import * as vscode from 'vscode';

class ChatViewProvider implements vscode.WebviewViewProvider {

	public static readonly viewType = 'guardedTutor.chatView';

	constructor(private readonly _extensionUri: vscode.Uri) {}

	public resolveWebviewView(webviewView: vscode.WebviewView) {
		webviewView.webview.options = {
			enableScripts: true
		};

		webviewView.webview.html = this._getHtml();
	}

	private _getHtml(): string {
		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
			</head>
			<body>
				<h2>Guarded Tutor</h2>
				<p>Chat panel placeholder — UI comes in LAA-10.</p>
			</body>
			</html>`;
	}
}

export function activate(context: vscode.ExtensionContext) {

	console.log('Congratulations, your extension "guarded-tutor" is now active!');

	const disposable = vscode.commands.registerCommand('guarded-tutor.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from guarded-tutor!');
	});
	context.subscriptions.push(disposable);

	const provider = new ChatViewProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, provider)
	);
}

export function deactivate() {}