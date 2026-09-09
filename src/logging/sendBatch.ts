/**
 * LAA-29: POST a packaged batch to Garvit's server.
 * LAA-30: minimal failure handling — log locally on failure, no retry queue.
 *
 * Note: this only ever sends ONE batch per session (built by LAA-27's
 * checkAndPackageIfDue). If the send fails, we do nothing fancy — the
 * "retry" story is already handled naturally: since we never call
 * markSessionSent() on failure, the next VS Code launch will just try
 * checkAndPackageIfDue() again and re-attempt the send.
 */

import { BatchPayload } from "./logSchema";

// TODO: swap this for Garvit's real endpoint once confirmed.
// Mock/placeholder for now per LAA-29's description.
const SERVER_ENDPOINT = "http://localhost:3000/logs";

export interface SendResult {
  success: boolean;
  error?: string;
}

/**
 * Sends one packaged batch to the server. Never throws — always resolves
 * with a SendResult so callers can decide what to do next (e.g. call
 * markSessionSent() from LAA-27 only on success).
 */
export async function sendBatch(payload: BatchPayload): Promise<SendResult> {
  try {
    const response = await fetch(SERVER_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const message = `Server responded with status ${response.status}`;
      console.error(`[LAA logging] Failed to send batch: ${message}`);
      return { success: false, error: message };
    }

    return { success: true };
  } catch (err) {
    // Network error, server unreachable, etc. — log locally, no retry loop.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[LAA logging] Failed to send batch: ${message}`);
    return { success: false, error: message };
  }
}
