import * as vscode from 'vscode';
import { callGuardedTutor, ConversationTurn, LLMClientError } from './llmClient';
import { getApiKey, promptAndStoreApiKey } from './apiKeyStorage';

// Friendly, generic text for infrastructure failures (timeouts, rate limits,
// network errors). These are NOT the guarded-mode boundary being enforced —
// they're plain connectivity/service problems, so it's fine to be direct
// about them; that has nothing to do with the invisible-refusal requirement,
// which only applies to withholding assignment solution content.
function friendlyErrorText(err: LLMClientError): string {
	switch (err.kind) {
		case 'no_api_key':
			return "I don't have an API key configured yet. Run \"Guarded Tutor: Set Gemini API Key\" from the command palette to get started.";
		case 'timeout':
			return "That's taking longer than expected to reach the AI service. Please try again.";
		case 'rate_limit':
			return "The AI service is busy right now. Please wait a moment and try again.";
		case 'network':
			return "I'm having trouble reaching the AI service. Please check your connection and try again.";
		default:
			return "Something went wrong getting a response. Please try again.";
	}
}

class ChatViewProvider implements vscode.WebviewViewProvider {

	public static readonly viewType = 'guardedTutor.chatView';

	// Per-session conversation history, sent with every call so the model can
	// catch leaks that only emerge when combined across turns (see the
	// guarded-mode prompt's fact-pair combination rule).
	private history: ConversationTurn[] = [];

	constructor(private readonly _extensionUri: vscode.Uri, private readonly _context: vscode.ExtensionContext) {}

	public resolveWebviewView(webviewView: vscode.WebviewView) {
		webviewView.webview.options = {
			enableScripts: true
		};

		webviewView.webview.html = this._getHtml();

				// Listen for messages coming FROM the webview
		webviewView.webview.onDidReceiveMessage(async (message) => {
			if (message.type === 'sendMessage') {

				// Capture the active file's content, if there is one open
				const activeEditor = vscode.window.activeTextEditor;

				let studentText: string = message.text;
				if (activeEditor) {
					const fileName = activeEditor.document.fileName;
					const languageId = activeEditor.document.languageId;
					const content = activeEditor.document.getText();
					studentText = `Current file (${fileName}, ${languageId}):\n\`\`\`\n${content}\n\`\`\`\n\nStudent question: ${message.text}`;
				}

				this.history.push({ role: 'student', text: studentText });

				const apiKey = await getApiKey(this._context);
				if (!apiKey) {
					this.history.pop();
					webviewView.webview.postMessage({
						type: 'botReply',
						text: friendlyErrorText(new LLMClientError('no_api_key', 'no key'))
					});
					return;
				}

				try {
					const reply = await callGuardedTutor(apiKey, this.history);
					this.history.push({ role: 'tutor', text: reply });
					webviewView.webview.postMessage({ type: 'botReply', text: reply });
				} catch (err) {
					// Roll back the student turn so a failed exchange doesn't
					// pollute future context sent to the model.
					this.history.pop();
					const llmErr = err instanceof LLMClientError
						? err
						: new LLMClientError('bad_response', String(err));
					webviewView.webview.postMessage({ type: 'botReply', text: friendlyErrorText(llmErr) });
				}
			}
		});
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
						max-width: 85%;
						word-wrap: break-word;
					}

					.userMessage {
						background-color: var(--vscode-button-background);
						color: var(--vscode-button-foreground);
						margin-left: auto;
						text-align: right;
					}

					.botMessage {
						background-color: var(--vscode-input-background);
						color: var(--vscode-input-foreground);
						margin-right: auto;
						text-align: left;
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
						<div class="message botMessage">Hi! Ask me anything about your code.</div>
					</div>
					<div id="inputArea">
						<input type="text" id="messageInput" placeholder="Type your question..." />
						<button id="sendButton">Send</button>
					</div>
				</div>

				<script>
					const vscode = acquireVsCodeApi();
					const messageList = document.getElementById('messageList');
					const messageInput = document.getElementById('messageInput');
					const sendButton = document.getElementById('sendButton');

					function addMessage(text, sender) {
						const div = document.createElement('div');
						div.classList.add('message', sender === 'user' ? 'userMessage' : 'botMessage');
						div.textContent = text;
						messageList.appendChild(div);
						messageList.scrollTop = messageList.scrollHeight;
					}

					function sendCurrentMessage() {
						const text = messageInput.value.trim();
						if (text.length === 0) {
							return;
						}
						addMessage(text, 'user');
						vscode.postMessage({ type: 'sendMessage', text: text });
						messageInput.value = '';
					}

					sendButton.addEventListener('click', sendCurrentMessage);

					messageInput.addEventListener('keydown', (event) => {
						if (event.key === 'Enter') {
							sendCurrentMessage();
						}
					});

					// Listen for messages coming FROM the extension backend
					window.addEventListener('message', (event) => {
						const message = event.data;
						if (message.type === 'botReply') {
							addMessage(message.text, 'bot');
						}
					});
				</script>
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

	context.subscriptions.push(
		vscode.commands.registerCommand('guarded-tutor.setApiKey', async () => {
			const key = await promptAndStoreApiKey(context);
			if (key) {
				vscode.window.showInformationMessage('Gemini API key saved.');
			}
		})
	);

	const provider = new ChatViewProvider(context.extensionUri, context);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, provider)
	);
}

export function deactivate() {}