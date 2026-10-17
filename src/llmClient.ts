import * as vscode from 'vscode';
import { GUARDED_MODE_PROMPT } from './guardedModePrompt';

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;

export interface ConversationTurn {
	role: 'student' | 'tutor';
	text: string;
	timestamp: string;
}

export type LLMErrorKind = 'timeout' | 'rate_limit' | 'network' | 'bad_response' | 'no_api_key';

export class LLMClientError extends Error {
	constructor(public readonly kind: LLMErrorKind, message: string) {
		super(message);
		this.name = 'LLMClientError';
	}
}

export interface LLMConfig {
	provider: 'gemini' | 'openai-compatible';
	geminiModel: string;
	customEndpoint: string;
	customModel: string;
	customApiKey: string;
}

export function getLLMConfig(): LLMConfig {
	const config = vscode.workspace.getConfiguration('guardedTutor');
	return {
		provider: config.get<'gemini' | 'openai-compatible'>('provider', 'gemini'),
		geminiModel: config.get<string>('geminiModel', 'gemini-3.5-flash-lite'),
		customEndpoint: config.get<string>('customEndpoint', 'http://localhost:11434/v1'),
		customModel: config.get<string>('customModel', 'llama3.1'),
		customApiKey: config.get<string>('customApiKey', ''),
	};
}

// The prompt's mandatory output format is "AUDIT: ... FINAL_RESPONSE: ...".
// The AUDIT section is the model's private reasoning about what it's
// withholding and why — it must never reach the student. If this marker is
// missing, treat the response as malformed rather than falling back to the
// raw text, since the raw text may contain that reasoning.
function extractFinalResponse(rawText: string): string | null {
	const match = /FINAL_RESPONSE:\s*/i.exec(rawText);
	if (!match) {
		return null;
	}
	return rawText.slice(match.index + match[0].length).trim();
}

async function postToGemini(apiKey: string, history: ConversationTurn[], model: string): Promise<string> {
	const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
	const contents = history.map((turn) => ({
		role: turn.role === 'student' ? 'user' : 'model',
		parts: [{ text: turn.text }],
	}));

	const body = {
		system_instruction: { parts: [{ text: GUARDED_MODE_PROMPT }] },
		contents,
	};

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	let response: Response;
	try {
		response = await fetch(`${apiUrl}?key=${apiKey}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			signal: controller.signal,
		});
	} catch (err) {
		if (err instanceof Error && err.name === 'AbortError') {
			throw new LLMClientError('timeout', 'Request to the AI service timed out.');
		}
		throw new LLMClientError('network', `Network error reaching the AI service: ${err instanceof Error ? err.message : String(err)}`);
	} finally {
		clearTimeout(timeout);
	}

	if (response.status === 429 || response.status === 503) {
		throw new LLMClientError('rate_limit', `AI service rate-limited or unavailable (status ${response.status}).`);
	}
	if (!response.ok) {
		throw new LLMClientError('bad_response', `AI service returned an unexpected status: ${response.status}.`);
	}

	const data = (await response.json()) as {
		candidates?: { content?: { parts?: { text?: string }[] } }[];
	};
	const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
	if (!text) {
		throw new LLMClientError('bad_response', 'AI service returned no usable content.');
	}
	return text;
}

async function postToOpenAICompatible(config: LLMConfig, history: ConversationTurn[]): Promise<string> {
	const endpoint = config.customEndpoint.replace(/\/+$/, '');
	const url = `${endpoint}/chat/completions`;

	const messages = [
		{ role: 'system', content: GUARDED_MODE_PROMPT },
		...history.map((turn) => ({
			role: turn.role === 'student' ? 'user' : 'assistant',
			content: turn.text,
		})),
	];

	const body = {
		model: config.customModel,
		messages,
		temperature: 0.2,
	};

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	if (config.customApiKey) {
		headers['Authorization'] = `Bearer ${config.customApiKey}`;
	}

	let response: Response;
	try {
		response = await fetch(url, {
			method: 'POST',
			headers,
			body: JSON.stringify(body),
			signal: controller.signal,
		});
	} catch (err) {
		if (err instanceof Error && err.name === 'AbortError') {
			throw new LLMClientError('timeout', 'Request to the local/custom AI service timed out.');
		}
		throw new LLMClientError('network', `Network error reaching the local/custom AI service at ${endpoint}: ${err instanceof Error ? err.message : String(err)}`);
	} finally {
		clearTimeout(timeout);
	}

	if (response.status === 429 || response.status === 503) {
		throw new LLMClientError('rate_limit', `Local/custom AI service rate-limited or busy (status ${response.status}).`);
	}
	if (!response.ok) {
		throw new LLMClientError('bad_response', `Local/custom AI service returned status ${response.status}.`);
	}

	const data = (await response.json()) as {
		choices?: { message?: { content?: string } }[];
	};
	const text = data.choices?.[0]?.message?.content;
	if (!text) {
		throw new LLMClientError('bad_response', 'Local/custom AI service returned no usable content.');
	}
	return text;
}

async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calls the guarded-mode tutor with the given conversation history and
 * returns only the student-visible reply (the private AUDIT section is
 * always stripped, never returned). Retries on rate limits, malformed
 * output-format responses, and transient network errors with backoff;
 * throws LLMClientError after exhausting retries.
 */
export async function callGuardedTutor(apiKey: string, history: ConversationTurn[]): Promise<string> {
	const config = getLLMConfig();
	if (config.provider === 'gemini' && !apiKey) {
		throw new LLMClientError('no_api_key', 'No Gemini API key configured.');
	}

	let lastError: LLMClientError | null = null;

	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		try {
			const raw = config.provider === 'openai-compatible'
				? await postToOpenAICompatible(config, history)
				: await postToGemini(apiKey, history, config.geminiModel);

			const final = extractFinalResponse(raw);
			if (final !== null) {
				return final;
			}
			lastError = new LLMClientError('bad_response', 'AI response did not follow the required output format.');
		} catch (err) {
			if (err instanceof LLMClientError) {
				if (err.kind === 'no_api_key') {
					throw err;
				}
				lastError = err;
			} else {
				throw err;
			}
		}

		if (attempt < MAX_RETRIES - 1) {
			await sleep(2 ** attempt * 1000);
		}
	}

	throw lastError ?? new LLMClientError('bad_response', 'AI service call failed for an unknown reason.');
}
