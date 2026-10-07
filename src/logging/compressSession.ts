/**
 * LAA-49: Client-side session ZIP archive compression
 *
 * Bundles the packaged session (chat history + attached files) into a
 * compressed .zip, ready for transmission. Per the ticket, this should
 * also include "execution trace logs" — but that data doesn't exist yet
 * (see LAA-42, which is still unscoped: its own description says it
 * needs team scoping before design work starts). This function only
 * bundles what currently exists — chat history + attached files — and
 * is written so a third item (execution traces) can be added later
 * without restructuring the zip layout.
 *
 * Requires the `jszip` package: npm install jszip
 * (and `npm install --save-dev @types/jszip` if using an older version
 * without bundled types — recent JSZip versions ship their own types)
 *
 * NOTE: this produces the zip but does NOT change how it's sent —
 * sendBatch.ts still POSTs JSON. Switching the actual transmission to
 * send this zip instead needs to be confirmed with Garvit first, since
 * it changes what his server's /log endpoint expects to receive
 * (JSON body vs. a zip file upload). Flagging this rather than
 * guessing at a new server contract.
 */

import JSZip from "jszip";
import { BatchPayload } from "./logSchema";

/**
 * Builds a zip containing:
 * - session.json — the full packaged payload (same shape sendBatch.ts sends today)
 * - files/ — each attached file, written out individually for easy inspection
 *
 * Returns the zip as a Buffer, ready to be written to disk or uploaded.
 */
export async function compressSessionPayload(
  payload: BatchPayload
): Promise<Buffer> {
  const zip = new JSZip();

  // The full structured payload, same as what's currently POSTed as JSON.
  zip.file("session.json", JSON.stringify(payload, null, 2));

  // Also write out each attached file individually, so the zip is
  // human-inspectable without needing to parse session.json first.
  payload.turns.forEach((turn, turnIndex) => {
    turn.attachedFiles.forEach((file) => {
      zip.file(`files/turn-${turnIndex}_${file.filename}`, file.content);
    });
  });

  // TODO (depends on LAA-42 being scoped): add an execution-trace file
  // here once that data exists, e.g.:
  // zip.file("execution-trace.json", JSON.stringify(executionTrace));

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
