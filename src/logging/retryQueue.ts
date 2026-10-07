/**
 * LAA-50: Offline retry & persistent transmission queue
 *
 * If sendBatch() fails (server unreachable, network error), the packaged
 * payload is persisted here instead of being dropped. On every launch,
 * before doing anything else, we try to flush this queue — so a failed
 * send from days ago still gets delivered once the server's reachable
 * again, with no data loss.
 *
 * This replaces LAA-30's original "just log locally, no retry queue"
 * approach for MVP — now failed sends are retried automatically.
 */

import * as vscode from "vscode";
import { BatchPayload } from "./logSchema";
import { sendBatch } from "./sendBatch";

const PENDING_QUEUE_KEY = "pendingTransmissions";

/**
 * Adds a payload to the persistent queue after a failed send.
 * Safe to call multiple times for the same session — duplicates by
 * sessionId are overwritten rather than piling up.
 */
export async function enqueuePending(
  context: vscode.ExtensionContext,
  payload: BatchPayload
): Promise<void> {
  const queue = context.globalState.get<BatchPayload[]>(PENDING_QUEUE_KEY, []);
  const withoutDuplicate = queue.filter((p) => p.sessionId !== payload.sessionId);
  withoutDuplicate.push(payload);
  await context.globalState.update(PENDING_QUEUE_KEY, withoutDuplicate);
}

/**
 * Removes a payload from the queue once it's been sent successfully.
 */
async function removePending(
  context: vscode.ExtensionContext,
  sessionId: string
): Promise<void> {
  const queue = context.globalState.get<BatchPayload[]>(PENDING_QUEUE_KEY, []);
  const remaining = queue.filter((p) => p.sessionId !== sessionId);
  await context.globalState.update(PENDING_QUEUE_KEY, remaining);
}

/**
 * Current contents of the queue — useful for debugging/manual testing.
 */
export function getPendingQueue(context: vscode.ExtensionContext): BatchPayload[] {
  return context.globalState.get<BatchPayload[]>(PENDING_QUEUE_KEY, []);
}

/**
 * Attempts to resend everything currently queued. Call this on every
 * launch, before checking for a new deadline-triggered send. Each
 * payload is tried independently — one failure doesn't block the rest
 * of the queue from being attempted.
 */
export async function flushPendingQueue(
  context: vscode.ExtensionContext
): Promise<{ sent: number; stillPending: number }> {
  const queue = getPendingQueue(context);
  let sent = 0;

  for (const payload of queue) {
    const result = await sendBatch(payload);
    if (result.success) {
      await removePending(context, payload.sessionId);
      sent++;
    }
    // On failure: leave it in the queue, try again next launch.
  }

  const stillPending = getPendingQueue(context).length;
  return { sent, stillPending };
}
