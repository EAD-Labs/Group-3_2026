/**
 * Orchestration: call this once from your extension's activate() function.
 * Ties together LAA-27 (read + package), LAA-29/30 (send), and LAA-50
 * (persistent retry queue).
 *
 * On every launch:
 *   1. Flush any previously-failed sends still sitting in the queue.
 *   2. Check if the current session's deadline has passed; if so,
 *      package and send it. If that send fails too, it joins the queue
 *      for next time — no data loss.
 */

import * as vscode from "vscode";
import { checkAndPackageIfDue, markSessionSent } from "./readHistoryAndPackage";
import { sendBatch } from "./sendBatch";
import { enqueuePending, flushPendingQueue } from "./retryQueue";
import { AssignmentSessionConfig } from "./logSchema";

export async function runLoggingCheckOnLaunch(
  context: vscode.ExtensionContext,
  config: AssignmentSessionConfig
): Promise<void> {
  // Step 1: retry anything that failed on a previous launch.
  const { sent, stillPending } = await flushPendingQueue(context);
  if (sent > 0) {
    console.log(`[LAA logging] Flushed ${sent} previously-queued session(s).`);
  }
  if (stillPending > 0) {
    console.log(`[LAA logging] ${stillPending} session(s) still pending — will retry next launch.`);
  }

  // Step 2: check if the current session is due to be sent.
  const payload = checkAndPackageIfDue(context, config);
  if (!payload) {
    return; // deadline not reached, already sent, or nothing to send
  }

  const result = await sendBatch(payload);

  if (result.success) {
    markSessionSent(context, config.sessionId);
  } else {
    // Don't lose this — queue it for retry on the next launch.
    await enqueuePending(context, payload);
    console.log(`[LAA logging] Send failed, queued for retry: ${result.error}`);
  }
}
