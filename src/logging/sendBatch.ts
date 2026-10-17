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

/**
 * Sends one packaged session archive to the server. Never throws — always
 * resolves with a SendResult so callers can queue failed sends or mark a
 * session sent only on success.
 */
export async function sendBatch(payload: BatchPayload): Promise<SendResult> {
  try {
    const archive = await compressSessionPayload(payload);
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
    });

    if (!response.ok) {
      const message = `Server responded with status ${response.status}`;
      console.error(`[LAA logging] Failed to send batch: ${message}`);
      return { success: false, error: message };
    }

    return { success: true };
  } catch (err) {
    // Return failures to runLoggingCheck/retryQueue for a later launch.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[LAA logging] Failed to send batch: ${message}`);
    return { success: false, error: message };
  }
}
