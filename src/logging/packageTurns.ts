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
 * Also: there is no separate "relevant file" array from Tanvi's side —
 * the active file's content is baked directly into the student's
 * message text before it's sent to the LLM. So attachedFiles is always
 * empty for now; the file content is already inside `message` as plain
 * text. Revisit if the professor's analysis needs files split out
 * separately later.
 */

import { LogEntry, BatchPayload } from "./logSchema";

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
 */
export function packageTurn(raw: RawChatTurn, sessionId: string): LogEntry {
  return {
    sessionId,
    timestamp: raw.timestamp ?? new Date().toISOString(),
    role: toSchemaRole(raw.role),
    message: raw.text,
    attachedFiles: [], // file content is already inline in `text` — nothing separate to attach
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