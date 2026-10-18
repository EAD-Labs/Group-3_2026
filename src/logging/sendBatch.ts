/**
 * LAA-29: POST a packaged session archive to Garvit's server.
 * LAA-30/LAA-50: return send failures to the persistent retry queue.
 *
 * NOTE: endpoint corrected from /logs to /log — /logs is only Garvit's
 * debug GET/listing route; the actual write route is POST /log.
 *
 * The client follows the multipart ZIP contract implemented on
 * origin/garvit/laa-server-packaging: POST /log with the ZIP in `archive`.
 */

import { BatchPayload } from "./logSchema";
import { compressSessionPayload } from "./compressSession";
import * as vscode from "vscode";

const DEFAULT_SERVER_ENDPOINT = "http://localhost:3000/log";

function getServerEndpoint(): string {
  return vscode.workspace
    .getConfiguration("guardedTutor")
    .get<string>("loggingServerUrl", DEFAULT_SERVER_ENDPOINT)
    .trim() || DEFAULT_SERVER_ENDPOINT;
}

export interface SendResult {
  success: boolean;
  error?: string;
}

const UPLOAD_TIMEOUT_MS = 30_000;
const MAX_UPLOAD_ATTEMPTS = 3;

function sleepWithJitter(attempt: number): Promise<void> {
  const baseMs = 300 * Math.pow(2, attempt);
  const jitterMs = Math.floor(Math.random() * 500);
  return new Promise((resolve) => setTimeout(resolve, baseMs + jitterMs));
}

/**
 * Sends one packaged session archive to the server. Never throws — always
 * resolves with a SendResult so callers can queue failed sends or mark a
 * session sent only on success.
 */
export async function sendBatch(payload: BatchPayload): Promise<SendResult> {
  let archive: Buffer;
  try {
    archive = await compressSessionPayload(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[LAA logging] Failed to compress batch: ${message}`);
    return { success: false, error: message };
  }

  let lastError = "Unknown upload failure";
  for (let attempt = 0; attempt < MAX_UPLOAD_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleepWithJitter(attempt - 1);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

    try {
      const formData = new FormData();
      const archiveBlob = new Blob([new Uint8Array(archive)], {
        type: "application/zip",
      });
      formData.append("archive", archiveBlob, "session.zip");

      const response = await fetch(getServerEndpoint(), {
        method: "POST",
        // Let fetch set the multipart boundary; Garvit's server reads the
        // uploaded ZIP from the `archive` field.
        body: formData,
        signal: controller.signal,
      });

      if (response.ok) {
        return { success: true };
      }

      lastError = `Server responded with status ${response.status}`;
      // Do not retry permanent 4xx client validation errors (except 408/429).
      if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) {
        console.error(`[LAA logging] Failed to send batch: ${lastError}`);
        return { success: false, error: lastError };
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    } finally {
      clearTimeout(timeout);
    }
  }

  console.error(`[LAA logging] Failed to send batch after ${MAX_UPLOAD_ATTEMPTS} attempts: ${lastError}`);
  return { success: false, error: lastError };
}

