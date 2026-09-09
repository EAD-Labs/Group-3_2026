/**
 * LAA-26: Package chat turns into the agreed schema
 *
 * Updated approach (per team discussion): instead of packaging one turn
 * at a time as it happens, we read the FULL chat history once, at the
 * assignment deadline, and package everything in one pass.
 *
 * This is a pure function — no networking here (that's LAA-29), no file
 * reading here either (that's the job of whatever hands us the raw
 * history from Tejas's engine).
 */

import { LogEntry, Role, AttachedFile, BatchPayload } from "./logSchema";

/**
 * Shape of one raw turn as it might come out of the chat history.
 * Adjust this once we confirm the exact shape Tejas's engine stores.
 */
export interface RawChatTurn {
  role: Role;
  message: string;
  timestamp?: string;          // if the engine already has one, we reuse it
  attachedFiles?: AttachedFile[];
}

/**
 * Packages a single raw turn into the agreed LogEntry schema.
 */
export function packageTurn(raw: RawChatTurn, sessionId: string): LogEntry {
  return {
    sessionId,
    timestamp: raw.timestamp ?? new Date().toISOString(),
    role: raw.role,
    message: raw.message,
    attachedFiles: raw.attachedFiles ?? [],
  };
}

/**
 * Packages an entire chat history (read once, at the deadline) into
 * the final batch payload ready to be sent (LAA-29 handles the sending).
 */
export function packageSession(
  rawTurns: RawChatTurn[],
  sessionId: string
): BatchPayload {
  return {
    sessionId,
    entries: rawTurns.map((turn) => packageTurn(turn, sessionId)),
  };
}
