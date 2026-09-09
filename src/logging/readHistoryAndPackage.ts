/**
 * LAA-27: Read full chat history from globalState at the deadline,
 * then package it into the final batch payload (ready for LAA-29 to send).
 *
 * Storage contract with Tejas:
 * - He appends each turn to globalState under key `chatHistory:<sessionId>`
 *   as it happens, using a RawChatTurn-shaped object.
 * - We only ever READ this array, once, right when the deadline hits
 *   (or on the next VS Code launch, if the deadline already passed while closed).
 */

import * as vscode from "vscode";
import { RawChatTurn, packageSession } from "./packageTurns";
import { BatchPayload, AssignmentSessionConfig } from "./logSchema";

function historyKey(sessionId: string): string {
  return `chatHistory:${sessionId}`;
}

/**
 * Reads the raw chat history for a session out of globalState.
 * Returns an empty array if nothing has been stored yet.
 */
export function readChatHistory(
  context: vscode.ExtensionContext,
  sessionId: string
): RawChatTurn[] {
  return context.globalState.get<RawChatTurn[]>(historyKey(sessionId), []);
}

/**
 * Has the deadline for this session already passed?
 */
export function isPastDeadline(config: AssignmentSessionConfig): boolean {
  return Date.now() >= new Date(config.deadline).getTime();
}

/**
 * Call this on extension activation (VS Code launch) and/or on a periodic
 * timer while VS Code is open. If the deadline has passed and we haven't
 * already sent this session, read the full history and package it.
 *
 * Returns null if the deadline hasn't been reached yet, or if there's
 * nothing to send.
 */
export function checkAndPackageIfDue(
  context: vscode.ExtensionContext,
  config: AssignmentSessionConfig
): BatchPayload | null {
  if (!isPastDeadline(config)) {
    return null;
  }

  const alreadySent = context.globalState.get<boolean>(
    `sent:${config.sessionId}`,
    false
  );
  if (alreadySent) {
    return null; // avoid re-sending on every launch after a successful send
  }

  const rawHistory = readChatHistory(context, config.sessionId);
  if (rawHistory.length === 0) {
    return null; // nothing was ever chatted for this session
  }

  return packageSession(rawHistory, config.sessionId);
}

/**
 * Call this after LAA-29 confirms a successful send, so we don't
 * re-package and re-send the same session again on the next launch.
 */
export function markSessionSent(
  context: vscode.ExtensionContext,
  sessionId: string
): void {
  context.globalState.update(`sent:${sessionId}`, true);
}
