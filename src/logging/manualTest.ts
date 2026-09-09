/**
 * LAA-31: Manual test — trigger a fake chat turn end-to-end and confirm
 * the POST body matches the agreed schema.
 *
 * How to run: temporarily call `runManualTest()` from your extension's
 * activate() function (or a test command), check the console output
 * and/or your browser/devtools network tab for the outgoing POST.
 *
 * This does NOT require Garvit's server to be ready — you're checking
 * that YOUR client produces correctly-shaped output, not his server's
 * behavior.
 */

import { RawChatTurn } from "./packageTurns";
import { packageSession } from "./packageTurns";
import { sendBatch } from "./sendBatch";

const FAKE_SESSION_ID = "manual-test-session";

const fakeHistory: RawChatTurn[] = [
  {
    role: "student",
    message: "Why is my for loop not printing anything?",
    attachedFiles: [
      { filename: "main.py", content: "for i in range(5)\n    print(i)" },
    ],
  },
  {
    role: "assistant",
    message:
      "Looks like your for loop is missing a colon at the end of the line. It should be `for i in range(5):`.",
  },
];

export async function runManualTest(): Promise<void> {
  console.log("[LAA-31] Packaging fake session...");
  const payload = packageSession(fakeHistory, FAKE_SESSION_ID);

  console.log("[LAA-31] Packaged payload:");
  console.log(JSON.stringify(payload, null, 2));

  console.log("[LAA-31] Sending to server (or mock endpoint)...");
  const result = await sendBatch(payload);

  if (result.success) {
    console.log("[LAA-31] ✅ Test passed — batch sent successfully.");
  } else {
    console.log(
      `[LAA-31] ⚠️ Send failed (expected if server isn't running): ${result.error}`
    );
    console.log(
      "[LAA-31] Check the payload shape above manually against the LAA-2 schema — that's the real thing this test verifies."
    );
  }
}
