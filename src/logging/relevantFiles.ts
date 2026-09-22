/**
 * LAA-28 (revised): Tejas keeps the active file embedded directly in the
 * student's message text, by design — so the LLM sees code context inline:
 *
 *   Current file (${fileName}, ${languageId}):
 *   ```
 *   ${content}
 *   ```
 *
 *   Student question: ${message.text}
 *
 * For logging, we want the file content split back out into attachedFiles
 * and the question kept clean in `message` — this parses that format
 * back apart. Only student turns can contain this format; assistant/tutor
 * turns are left untouched.
 */

import { AttachedFile } from "./logSchema";

const EMBEDDED_FILE_PATTERN =
  /^Current file \(([^,]+), ([^)]+)\):\n```\n([\s\S]*?)\n```\n\nStudent question: ([\s\S]*)$/;

export interface ParsedStudentMessage {
  question: string;
  attachedFiles: AttachedFile[];
}

/**
 * Splits a student turn's raw text into the clean question + any embedded
 * file content. If the text doesn't match the embedded-file format (e.g.
 * no file was open when the student asked), the whole text is treated as
 * the question and attachedFiles is empty.
 */
export function parseStudentMessage(rawText: string): ParsedStudentMessage {
  const match = rawText.match(EMBEDDED_FILE_PATTERN);

  if (!match) {
    return { question: rawText, attachedFiles: [] };
  }

  const [, fileName, , content, question] = match;

  return {
    question,
    attachedFiles: [{ filename: fileName, content }],
  };
}
