/**
 * LAA-49: Client-side session ZIP archive compression
 *
 * Bundles the packaged session (chat history + attached files) into the
 * ZIP layout expected by Garvit's server branch. The required
 * execution_trace.json is an empty compatibility entry: the professor has
 * directed that no code-execution data be stored (LAA-42).
 *
 * Requires the `jszip` package: npm install jszip
 * (and `npm install --save-dev @types/jszip` if using an older version
 * without bundled types — recent JSZip versions ship their own types)
 *
 * sendBatch.ts uploads this archive as multipart field `archive` to /log.
 */

import JSZip from "jszip";
import { BatchPayload } from "./logSchema";

const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 2000;

/**
 * Builds an archive matching server/archive.js on the server packaging branch:
 * - turns.json — the full packaged chat payload
 * - execution_trace.json — an empty array; no execution data is collected
 * - files/ — each distinct attached file snapshot, written out individually
 *
 * Returns the zip as a Buffer, ready to be written to disk or uploaded.
 */
export async function compressSessionPayload(
  payload: BatchPayload
): Promise<Buffer> {
  const zip = new JSZip();

  // Deduplicate unchanged consecutive file snapshots across turns so marathon
  // chats don't bloat the archive or hit entry limits when the file didn't change.
  const lastContentByFilename = new Map<string, string>();
  const filesToWrite: { archivePath: string; content: string }[] = [];

  payload.turns.forEach((turn, turnIndex) => {
    turn.attachedFiles.forEach((file, fileIndex) => {
      const safeFilename = file.filename
        .replace(/\\/g, "/")
        .split("/")
        .pop()
        ?.replace(/[\u0000-\u001f<>:"|?*]/g, "_") || "attachment";
      const prevContent = lastContentByFilename.get(safeFilename);
      if (prevContent !== file.content) {
        lastContentByFilename.set(safeFilename, file.content);
        filesToWrite.push({
          archivePath: `files/turn-${turnIndex}-${fileIndex}_${safeFilename}`,
          content: file.content,
        });
      }
    });
  });

  const serializedPayload = JSON.stringify(payload, null, 2);
  let uncompressedBytes = Buffer.byteLength(serializedPayload) + Buffer.byteLength("[]");
  for (const file of filesToWrite) {
    uncompressedBytes += Buffer.byteLength(file.content);
  }

  const archiveEntryCount = 2 + filesToWrite.length + (filesToWrite.length > 0 ? 1 : 0);
  if (archiveEntryCount > MAX_ARCHIVE_ENTRIES) {
    throw new Error(`Session archive exceeds ${MAX_ARCHIVE_ENTRIES} entries.`);
  }
  if (uncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
    throw new Error("Session archive exceeds the server's 50 MiB expanded-size limit.");
  }

  // Keep the structured bundle intact under the filename the server decoder expects.
  zip.file("turns.json", serializedPayload);

  // The professor has explicitly ruled out storing execution data. Garvit's
  // current archive decoder requires this entry, so retain it as an empty array.
  zip.file("execution_trace.json", JSON.stringify([], null, 2));

  // Write out each distinct attached file snapshot under files/.
  for (const file of filesToWrite) {
    zip.file(file.archivePath, file.content);
  }

  const archive = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  if (archive.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error("Session archive exceeds the server's 25 MiB upload limit.");
  }

  return archive;
}
