/**
 * LAA-26: Package chat turns into the agreed schema
 *
 * Reads the FULL chat history once, at the assignment deadline, and
 * packages everything in one pass into the batch payload.
 *
 * NOTE: BatchPayload.turns (was `entries`) — renamed to match Garvit's
 * server contract (server/index.js, server/validation.js expect
 * { sessionId, turns }).
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
    turns: rawTurns.map((turn) => packageTurn(turn, sessionId)),
  };
}
