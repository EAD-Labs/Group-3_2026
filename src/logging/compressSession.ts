/**
 * LAA-49: Client-side session ZIP archive compression
 *
 * Bundles the packaged session (chat history + attached files) into the
 * ZIP layout expected by Garvit's server branch. The required
 * execution_trace.json entry is empty until the team scopes LAA-42.
 *
 * Requires the `jszip` package: npm install jszip
 * (and `npm install --save-dev @types/jszip` if using an older version
 * without bundled types — recent JSZip versions ship their own types)
 *
 * sendBatch.ts uploads this archive as multipart field `archive` to /log.
 */

import JSZip from "jszip";
import { BatchPayload } from "./logSchema";

const MAX_ARCHIVE_BYTES = 10 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 100;

/**
 * Builds an archive matching server/archive.js on the server packaging branch:
 * - turns.json — the full packaged chat payload
 * - execution_trace.json — an empty placeholder until LAA-42 defines capture
 * - files/ — each attached file, written out individually for easy inspection
 *
 * Returns the zip as a Buffer, ready to be written to disk or uploaded.
 */
export async function compressSessionPayload(
  payload: BatchPayload
): Promise<Buffer> {
  const zip = new JSZip();
  const serializedPayload = JSON.stringify(payload, null, 2);
  let attachedFileCount = 0;
  let uncompressedBytes = Buffer.byteLength(serializedPayload) + Buffer.byteLength("[]");

  for (const turn of payload.turns) {
    attachedFileCount += turn.attachedFiles.length;
    for (const file of turn.attachedFiles) {
      uncompressedBytes += Buffer.byteLength(file.content);
    }
  }

  const archiveEntryCount = 2 + attachedFileCount + (attachedFileCount > 0 ? 1 : 0);
  if (archiveEntryCount > MAX_ARCHIVE_ENTRIES) {
    throw new Error(`Session archive exceeds ${MAX_ARCHIVE_ENTRIES} entries.`);
  }
  if (uncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
    throw new Error("Session archive exceeds the server's 20 MiB expanded-size limit.");
  }

  // Keep the structured bundle intact under the filename the server decoder expects.
  zip.file("turns.json", serializedPayload);

  // LAA-42 still needs the team to define execution capture and its schema.
  // Emit the required archive entry with no fabricated trace data for now.
  zip.file("execution_trace.json", JSON.stringify([], null, 2));

  // Also write out each attached file individually, so the zip is
  // human-inspectable without needing to parse turns.json first.
  payload.turns.forEach((turn, turnIndex) => {
    turn.attachedFiles.forEach((file, fileIndex) => {
      // Keep only the submitted filename's final path component. A filename
      // from an attached workspace file must never create paths outside the
      // archive's files/ directory. Include the file index as well so two
      // attachments with the same name in one turn do not overwrite each other.
      const safeFilename = file.filename
        .replace(/\\/g, "/")
        .split("/")
        .pop()
        ?.replace(/[\u0000-\u001f<>:"|?*]/g, "_") || "attachment";
      zip.file(`files/turn-${turnIndex}-${fileIndex}_${safeFilename}`, file.content);
    });
  });

  const archive = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  if (archive.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error("Session archive exceeds the server's 10 MiB upload limit.");
  }

  return archive;
}
