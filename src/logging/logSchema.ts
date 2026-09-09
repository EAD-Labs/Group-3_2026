/**
 * LAA-25: Local types/constants matching the agreed LAA-2 schema
 *
 * Session model (agreed on LAA-2):
 * - One session = one assignment, from assignment-post to assignment-deadline
 * - Both start and deadline are hardcoded manually per assignment (no auto-fetch)
 * - No overlapping sessions — only one assignment active at a time
 * - Transmission: at the deadline, the full chat history for the session is read
 *   in one go (not captured turn-by-turn during the chat) and sent as a single batch
 * - If offline at the deadline, retry is deferred to the next VS Code launch (no retry loop)
 */

// ---- One logged chat turn ----

export type Role = "student" | "assistant";

export interface AttachedFile {
  filename: string;
  content: string;
}

export interface LogEntry {
  sessionId: string;       // groups turns from one assignment/session
  timestamp: string;       // ISO 8601, UTC
  role: Role;
  message: string;
  attachedFiles: AttachedFile[];
}

// ---- Session-level config (hardcoded per assignment) ----

export interface AssignmentSessionConfig {
  sessionId: string;       // e.g. "assignment-3"
  startTime: string;       // ISO 8601 UTC, hardcoded manually
  deadline: string;        // ISO 8601 UTC, hardcoded manually
}

// Example — replace per assignment until this is made configurable
export const CURRENT_SESSION: AssignmentSessionConfig = {
  sessionId: "assignment-3",
  startTime: "2026-09-05T00:00:00Z",
  deadline: "2026-09-12T23:59:59Z",
};

// ---- Payload built from full chat history at the deadline, sent as one batch ----

export interface BatchPayload {
  sessionId: string;
  entries: LogEntry[];
}

// ---- Constants ----

export const MAX_ATTACHED_FILES = 3; // per Prof. Sharma's constraint: only relevant files, not the whole assignment
