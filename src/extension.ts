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
				<style>
					html, body {
						height: 100%;
						margin: 0;
						padding: 0;
						font-family: var(--vscode-font-family);
						color: var(--vscode-foreground);
						background-color: var(--vscode-editor-background);
					}

					#chatContainer {
						display: flex;
						flex-direction: column;
						height: 100vh;
						box-sizing: border-box;
					}

					#messageList {
						flex: 1;
						overflow-y: auto;
						padding: 10px;
					}

					.message {
						margin-bottom: 10px;
						padding: 8px 10px;
						border-radius: 6px;
						background-color: var(--vscode-input-background);
						word-wrap: break-word;
					}

					#inputArea {
						display: flex;
						padding: 8px;
						border-top: 1px solid var(--vscode-panel-border);
					}

					#messageInput {
						flex: 1;
						padding: 6px 8px;
						border: 1px solid var(--vscode-input-border);
						background-color: var(--vscode-input-background);
						color: var(--vscode-input-foreground);
						border-radius: 4px;
						outline: none;
					}

					#sendButton {
						margin-left: 6px;
						padding: 6px 14px;
						border: none;
						border-radius: 4px;
						background-color: var(--vscode-button-background);
						color: var(--vscode-button-foreground);
						cursor: pointer;
					}

					#sendButton:hover {
						background-color: var(--vscode-button-hoverBackground);
					}
				</style>
			</head>
			<body>
				<div id="chatContainer">
					<div id="messageList">
						<div class="message">Hi! Ask me anything about your code.</div>
					</div>
					<div id="inputArea">
						<input type="text" id="messageInput" placeholder="Type your question..." />
						<button id="sendButton">Send</button>
					</div>
				</div>
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