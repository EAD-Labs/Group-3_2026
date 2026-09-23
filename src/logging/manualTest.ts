/**
 * LAA-31: Manual test — trigger a fake chat turn end-to-end and confirm
 * the POST body matches the agreed schema.
 *
 * FIXED: updated to use the real RawChatTurn shape from packageTurns.ts —
 * { role: "student" | "tutor", text: string } — matching Tejas's actual
 * ConversationTurn. The old { role: "assistant", message } shape no
 * longer exists and was causing a compile error on master.
 *
 * How to run: temporarily call `runManualTest()` from your extension's
 * activate() function (or a test command), check the console output
 * and/or your browser/devtools network tab for the outgoing POST.
 *
 * This does NOT require Garvit's server to be ready — you're checking
 * that YOUR client produces correctly-shaped output, not his server's
 * behavior.
 */

import { RawChatTurn, packageSession } from "./packageTurns";
import { sendBatch } from "./sendBatch";

const FAKE_SESSION_ID = "manual-test-session";

const fakeHistory: RawChatTurn[] = [
  {
    role: "student",
    text: "Current file (main.py, python):\n```\nfor i in range(5)\n    print(i)\n```\n\nStudent question: Why is my for loop not printing anything?",
  },
  {
    role: "tutor",
    text: "Looks like your for loop is missing a colon at the end of the line. It should be `for i in range(5):`.",
  },
];

export async function runManualTest(): Promise<void> {
  console.log("[LAA-31] Packaging fake session...");
  const payload = packageSession(fakeHistory, FAKE_SESSION_ID);

  console.log("[LAA-31] Packaged payload:");
  console.log(JSON.stringify(payload, null, 2));

  console.log(
    "[LAA-31] Check above: student turn's message should be just the question, with the file split into attachedFiles."
  );

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
