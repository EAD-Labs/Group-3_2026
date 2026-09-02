// Basic payload validation (LAA-34) against the finalized LAA-2 schema:
//
// {
//   "sessionId": "string - groups turns from one assignment window",
//   "turns": [
//     {
//       "timestamp": "ISO 8601 string, UTC",
//       "role": "student | assistant",
//       "message": "string",
//       "attachedFiles": [ { "filename": "string", "content": "string" } ]  // optional
//     }
//   ]
// }
//
// Doesn't need to be fancy for this dev server — manual checks are enough.

function validateSessionBundle(body) {
  const errors = [];

  if (!body || typeof body !== "object") {
    return ["Request body must be a JSON object."];
  }

  if (!body.sessionId || typeof body.sessionId !== "string") {
    errors.push("Missing or invalid required field: sessionId (string).");
  }

  if (!Array.isArray(body.turns) || body.turns.length === 0) {
    errors.push("Missing or invalid required field: turns (non-empty array).");
    return errors; // no point validating individual turns if the array itself is bad
  }

  body.turns.forEach((turn, i) => {
    if (!turn || typeof turn !== "object") {
      errors.push(`turns[${i}] must be an object.`);
      return;
    }
    if (!turn.timestamp || typeof turn.timestamp !== "string") {
      errors.push(`turns[${i}].timestamp is required (ISO 8601 string, UTC).`);
    }
    if (turn.role !== "student" && turn.role !== "assistant") {
      errors.push(`turns[${i}].role must be "student" or "assistant".`);
    }
    if (!turn.message || typeof turn.message !== "string") {
      errors.push(`turns[${i}].message is required (string).`);
    }
    if (turn.attachedFiles !== undefined) {
      if (!Array.isArray(turn.attachedFiles)) {
        errors.push(`turns[${i}].attachedFiles must be an array if present.`);
      } else {
        turn.attachedFiles.forEach((f, j) => {
          if (!f || typeof f.filename !== "string" || typeof f.content !== "string") {
            errors.push(
              `turns[${i}].attachedFiles[${j}] must have string "filename" and "content".`
            );
          }
        });
      }
    }
  });

  return errors;
}

module.exports = { validateSessionBundle };
