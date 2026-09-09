/**
 * LAA-28: Reuse Tanvi's "relevant file" logic (LAA-13) and map it into
 * the schema's `attachedFiles` field.
 *
 * IMPORTANT: we do NOT reimplement "what counts as relevant" here — that
 * decision lives entirely in Tanvi's getRelevantFiles() (in extension.ts).
 * We only convert her output shape into ours.
 *
 * Tanvi's shape (LAA-13):   { fileName, languageId, content }[]  (0 or 1 items)
 * Our schema shape (LAA-2): { filename, content }[]              (AttachedFile)
 */

import { AttachedFile } from "./logSchema";

/**
 * Shape returned by Tanvi's getRelevantFiles() in extension.ts.
 * Mirrors her implementation — update if her shape changes.
 */
export interface RelevantFile {
  fileName: string;
  languageId: string;
  content: string;
}

/**
 * Converts Tanvi's relevant-file output into our schema's AttachedFile[].
 * We drop `languageId` since it's not part of the agreed LAA-2 schema —
 * if we ever want it, add it to AttachedFile in logSchema.ts first so
 * both the schema and this mapping stay in sync.
 */
export function toAttachedFiles(relevantFiles: RelevantFile[]): AttachedFile[] {
  return relevantFiles.map((f) => ({
    filename: f.fileName,
    content: f.content,
  }));
}
