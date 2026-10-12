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

// TODO: swap this for Garvit's real public URL once it's hosted somewhere
// reachable beyond his own machine — localhost only works on his laptop.
const SERVER_ENDPOINT = "http://localhost:3000/log"; // was /logs — fixed per Garvit's report

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

    const response = await fetch(SERVER_ENDPOINT, {
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
