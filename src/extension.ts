import * as vscode from 'vscode';
import { callGuardedTutor, ConversationTurn, LLMClientError } from './llmClient';
import { getApiKey, promptAndStoreApiKey } from './apiKeyStorage';
import { CURRENT_SESSION } from './logging/logSchema';
import { runLoggingCheckOnLaunch } from './logging/runLoggingCheck';
import { FileContext, MessagePayload, formatPayloadForPrompt } from './messagePayload';


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

/**
 * Determines which file(s) are "relevant" to the student's current question.
 *
 * Decision (LAA-13): relevant files = the active editor file only.
 * Always returns an array (0 or 1 items) so consumers (AI engine, logging)
 * never need to special-case single-file vs multi-file.
 * Pairing logic (e.g. matching .h/.c) is deferred until testing shows
 * single-file context isn't enough.
 */
function getRelevantFiles(): FileContext[] {
	const activeEditor = vscode.window.activeTextEditor;

	if (!activeEditor) {
		return [];
	}

	return [
		{
			fileName: activeEditor.document.fileName,
			languageId: activeEditor.document.languageId,
			content: activeEditor.document.getText()
		}
	];
}

function getNonce(): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let text = '';
	for (let i = 0; i < 32; i++) {
		text += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return text;
}

class ChatViewProvider implements vscode.WebviewViewProvider {

	public static readonly viewType = 'guardedTutor.chatView';

	// Per-session model context, sent with every call so the model can catch
	// leaks that only emerge when combined across turns (see the guarded-mode
	// prompt's fact-pair combination rule).
	private llmHistory: ConversationTurn[] = [];

	// Durable history key shared with the logging pipeline. This is written on
	// every turn so the batch logger can read the full session later, even if
	// VS Code restarts or the webview is recreated mid-assignment.
	private readonly historyKey = `chatHistory:${CURRENT_SESSION.sessionId}`;
	private readonly messageListeners = new Map<vscode.WebviewView, vscode.Disposable>();
	private readonly viewDisposalListeners = new Map<vscode.WebviewView, vscode.Disposable>();
	private readonly processedMessageIds = new Set<string>();

	constructor(private readonly _extensionUri: vscode.Uri, private readonly _context: vscode.ExtensionContext) {}

	private async appendToDurableHistory(turn: ConversationTurn): Promise<void> {
		const current = this._context.globalState.get<ConversationTurn[]>(this.historyKey, []);
		current.push(turn);
		await this._context.globalState.update(this.historyKey, current);
	}

	public resolveWebviewView(webviewView: vscode.WebviewView) {
		// A view can be resolved again after being hidden or recreated. Dispose
		// any listeners associated with its previous resolution first.
		this.messageListeners.get(webviewView)?.dispose();
		this.viewDisposalListeners.get(webviewView)?.dispose();

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'media')]
		};

		webviewView.webview.html = this._getHtml(webviewView.webview);

		// Listen for messages coming FROM the webview. Keep the disposable so a
		// re-resolution or view disposal cannot leave a second handler behind.
		const messageListener = webviewView.webview.onDidReceiveMessage(async (message) => {
			if (message.type === 'sendMessage') {
				const requestId = message.requestId;
				if (typeof requestId !== 'string' || this.processedMessageIds.has(requestId)) {
					return;
				}
				// Set synchronously before the first await so concurrent duplicate
				// events cannot append the same student turn twice.
				this.processedMessageIds.add(requestId);

				// LAA-14: build the single documented payload (message + relevant files)
				const payload: MessagePayload = {
					message: message.text,
					files: getRelevantFiles()
				};
				console.log('Outgoing payload:', payload);

				// Same prompt text as before, now generated from the payload
				const studentText = formatPayloadForPrompt(payload);

				const studentTurn: ConversationTurn = {
					role: 'student',
					text: studentText,
					timestamp: new Date().toISOString(),
				};
				this.llmHistory.push(studentTurn);
				await this.appendToDurableHistory(studentTurn);

				const apiKey = await getApiKey(this._context);
				if (!apiKey) {
					this.llmHistory.pop();
					webviewView.webview.postMessage({
						type: 'botReply',
						text: friendlyErrorText(new LLMClientError('no_api_key', 'no key'))
					});
					return;
				}

				try {
					const reply = await callGuardedTutor(apiKey, this.llmHistory);
					const tutorTurn: ConversationTurn = {
						role: 'tutor',
						text: reply,
						timestamp: new Date().toISOString(),
					};
					this.llmHistory.push(tutorTurn);
					await this.appendToDurableHistory(tutorTurn);
					webviewView.webview.postMessage({ type: 'botReply', text: reply });
				} catch (err) {
					// Roll back only the model context. The durable history keeps the
					// attempted student turn so the logging pipeline still sees it.
					this.llmHistory.pop();
					const llmErr = err instanceof LLMClientError
						? err
						: new LLMClientError('bad_response', String(err));
					webviewView.webview.postMessage({ type: 'botReply', text: friendlyErrorText(llmErr) });
				}
			}
		});
		this.messageListeners.set(webviewView, messageListener);
		const viewDisposalListener = webviewView.onDidDispose(() => {
			messageListener.dispose();
			this.messageListeners.delete(webviewView);
			this.viewDisposalListeners.delete(webviewView);
		});
		this.viewDisposalListeners.set(webviewView, viewDisposalListener);
	}

		private _getHtml(webview: vscode.Webview): string {
		const nonce = getNonce();
		const vendor = (file: string) =>
			webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vendor', file));
		const markdownJs = vendor('markdown-it.min.js');
		const highlightJs = vendor('highlight.min.js');
		const highlightCss = vendor('github-dark.min.css');

		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
				<link rel="stylesheet" href="${highlightCss}">
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

				    .botMessage p { margin: 0 0 8px 0; }
					.botMessage p:last-child { margin-bottom: 0; }
					.botMessage ul, .botMessage ol { margin: 4px 0 8px 0; padding-left: 20px; text-align: left; }
					.botMessage pre { margin: 6px 0; overflow-x: auto; border-radius: 4px; }
					.botMessage pre code.hljs { padding: 8px; border-radius: 4px; }
					.botMessage code { font-family: var(--vscode-editor-font-family, monospace); }
					.botMessage :not(pre) > code {
						background-color: var(--vscode-textCodeBlock-background);
						padding: 1px 4px;
						border-radius: 3px;
					}
					.meta { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; font-size: 0.8em; }
					.userMessage .meta { justify-content: flex-end; }
					.avatar { width: 18px; height: 18px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold; }
					.avatarUser { background-color: var(--vscode-button-foreground); color: var(--vscode-button-background); }
					.avatarTutor { background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); }
					.name { font-weight: 600; }
					.time { opacity: 0.7; }
					.botMessage { border-left: 3px solid var(--vscode-button-background); }
				</style>
			</head>
			<body>
				<div id="chatContainer">
					<div id="messageList">
						
					</div>
					<div id="inputArea">
						<input type="text" id="messageInput" placeholder="Type your question..." />
						<button id="sendButton">Send</button>
					</div>
				</div>

				<script nonce="${nonce}" src="${markdownJs}"></script>
				<script nonce="${nonce}" src="${highlightJs}"></script>
				<script nonce="${nonce}">
					const vscode = acquireVsCodeApi();
					const messageList = document.getElementById('messageList');
					const messageInput = document.getElementById('messageInput');
					const sendButton = document.getElementById('sendButton');

						const md = window.markdownit({
						html: false,
						highlight: function (str, lang) {
							if (lang && hljs.getLanguage(lang)) {
								try {
									return '<pre><code class="hljs">' + hljs.highlight(str, { language: lang, ignoreIllegals: true }).value + '</code></pre>';
								} catch (e) { }
							}
							return '<pre><code class="hljs">' + md.utils.escapeHtml(str) + '</code></pre>';
						}
					});

										function formatTime(date) {
						return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
					}

					function addMessage(text, sender) {
						const isUser = sender === 'user';
						const now = new Date();

						const div = document.createElement('div');
						div.classList.add('message', isUser ? 'userMessage' : 'botMessage');

						const meta = document.createElement('div');
						meta.classList.add('meta');

						const avatar = document.createElement('span');
						avatar.classList.add('avatar', isUser ? 'avatarUser' : 'avatarTutor');
						avatar.textContent = isUser ? 'Y' : 'T';

						const name = document.createElement('span');
						name.classList.add('name');
						name.textContent = isUser ? 'You' : 'Tutor';

						const time = document.createElement('span');
						time.classList.add('time');
						time.textContent = formatTime(now);
						time.title = now.toLocaleString();

						meta.appendChild(avatar);
						meta.appendChild(name);
						meta.appendChild(time);

						const body = document.createElement('div');
						if (isUser) {
							body.textContent = text;
						} else {
							body.innerHTML = md.render(text);
						}

						div.appendChild(meta);
						div.appendChild(body);
						messageList.appendChild(div);
						messageList.scrollTop = messageList.scrollHeight;
					}

					addMessage('Hi! Ask me anything about your code.', 'bot');

					function sendCurrentMessage() {
						const text = messageInput.value.trim();
						if (text.length === 0) {
							return;
						}
						addMessage(text, 'user');
						const requestId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
							? crypto.randomUUID()
							: Date.now() + '-' + Math.random().toString(36).slice(2);
						vscode.postMessage({ type: 'sendMessage', requestId, text: text });
						messageInput.value = '';
					}

					sendButton.addEventListener('click', sendCurrentMessage);

					messageInput.addEventListener('keydown', (event) => {
						if (event.key === 'Enter') {
							event.preventDefault();
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

	runLoggingCheckOnLaunch(context, CURRENT_SESSION).catch((err) => {
		console.error('Failed to run logging check on launch:', err);
	});

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
