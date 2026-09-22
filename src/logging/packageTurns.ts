/**
 * LAA-26: Package chat turns into the agreed schema
 *
 * UPDATED to match Tejas's actual ConversationTurn shape found in
 * extension.ts:
 *   { role: 'student' | 'tutor', text: string }
 *
 * Our final schema (LogEntry, sent to the server) keeps its own field
 * names — role: 'student' | 'assistant', message: string — so we
 * convert at the boundary here rather than renaming the schema itself.
 * This way the server contract doesn't need to change just because
 * Tejas's internal naming is different.
 *
 * Relevant files (LAA-28, confirmed with Tejas): the active file is
 * intentionally embedded directly inside the student's message text so
 * the LLM sees code context inline. For logging, we split it back out
 * via parseStudentMessage() so `message` holds just the question and
 * `attachedFiles` holds the file content separately.
 */

import { LogEntry, BatchPayload } from "./logSchema";
import { parseStudentMessage } from "./relevantFiles";

/**
 * Mirrors Tejas's real ConversationTurn shape from extension.ts.
 * Update this if his shape changes.
 */
export interface RawChatTurn {
  role: "student" | "tutor";
  text: string;
  timestamp?: string; // not currently present on his side — we generate one if missing
}

/**
 * Converts Tejas's role naming ("tutor") to our schema's role naming
 * ("assistant"). Student stays the same on both sides.
 */
function toSchemaRole(role: "student" | "tutor"): "student" | "assistant" {
  return role === "tutor" ? "assistant" : "student";
}

/**
 * Packages a single raw turn (Tejas's shape) into the agreed LogEntry schema.
 * Student turns may have an embedded file — split it out so `message` is
 * just the question and `attachedFiles` carries the file separately.
 * Assistant/tutor turns never have embedded files, so they pass through as-is.
 */
export function packageTurn(raw: RawChatTurn, sessionId: string): LogEntry {
  const isStudent = raw.role === "student";
  const parsed = isStudent ? parseStudentMessage(raw.text) : null;

  return {
    sessionId,
    timestamp: raw.timestamp ?? new Date().toISOString(),
    role: toSchemaRole(raw.role),
    message: parsed ? parsed.question : raw.text,
    attachedFiles: parsed ? parsed.attachedFiles : [],
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
