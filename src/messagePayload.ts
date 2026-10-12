/**
 * One file's captured content (LAA-12 / LAA-13).
 * These are the "relevant" file(s) as decided in LAA-13
 * (currently: the active editor file only).
 */
export interface FileContext {
	fileName: string;    // full path/name as VS Code reports it
	languageId: string;  // e.g. 'python', 'c', 'cpp'
	content: string;     // full text of the file at the moment of sending
}

/**
 * LAA-14: the payload built for every student message.
 * Consumed by the Assistance Engine (LAA-4/LAA-21)
 * and the Logging Client (LAA-5/LAA-28).
 *
 * - message: exactly what the student typed
 * - files:   relevant file(s); an EMPTY array if no editor is open (never null)
 */
export interface MessagePayload {
	message: string;
	files: FileContext[];
}

/**
 * Builds the text sent to the LLM from a payload.
 * IMPORTANT: keep this format unchanged. Lavanya's logging (LAA-28)
 * splits the file content back out of this text.
 */
export function formatPayloadForPrompt(payload: MessagePayload): string {
	if (payload.files.length === 0) {
		return payload.message;
	}
	const file = payload.files[0];
	return `Current file (${file.fileName}, ${file.languageId}):\n\`\`\`\n${file.content}\n\`\`\`\n\nStudent question: ${payload.message}`;
}