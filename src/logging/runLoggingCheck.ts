/**
 * Orchestration: call this once from your extension's activate() function.
 * Ties together LAA-27 (read + package) and LAA-29/30 (send + failure handling).
 *
 * This covers your agreed "retry on next launch" behavior naturally —
 * if the send fails, we simply don't mark it sent, so this same function
 * will try again the next time VS Code starts.
 */

import * as vscode from "vscode";
import { checkAndPackageIfDue, markSessionSent } from "./readHistoryAndPackage";
import { sendBatch } from "./sendBatch";
import { AssignmentSessionConfig } from "./logSchema";

export async function runLoggingCheckOnLaunch(
  context: vscode.ExtensionContext,
  config: AssignmentSessionConfig
): Promise<void> {
  const payload = checkAndPackageIfDue(context, config);

  if (!payload) {
    return; // deadline not reached, already sent, or nothing to send
  }

  const result = await sendBatch(payload);

  if (result.success) {
    markSessionSent(context, config.sessionId);
  }
  // On failure: do nothing. Next launch will retry automatically,
  // since markSessionSent() was never called.
}
