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

  if (!body || typeof body !== "object" || Array.isArray(body)) {
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

  if (body.executionTrace !== undefined) {
    if (!Array.isArray(body.executionTrace)) errors.push("executionTrace must be an array.");
    else body.executionTrace.forEach((trace, i) => {
      if (!trace || typeof trace !== "object" || Array.isArray(trace)) {
        errors.push(`executionTrace[${i}] must be an object.`); return;
      }
      if (typeof trace.timestamp !== "string" || !trace.timestamp.endsWith("Z") || !Number.isFinite(Date.parse(trace.timestamp))) errors.push(`executionTrace[${i}].timestamp must be UTC ISO 8601.`);
      if (!["stdout", "stderr", "output"].some(key => typeof trace[key] === "string")) errors.push(`executionTrace[${i}] requires stdout, stderr, or output (string).`);
      for (const key of ["stdout", "stderr", "output", "code", "filename"]) {
        if (trace[key] !== undefined && typeof trace[key] !== "string") errors.push(`executionTrace[${i}].${key} must be a string.`);
      }
      if (trace.exitCode !== undefined && trace.exitCode !== null && !Number.isInteger(trace.exitCode)) errors.push(`executionTrace[${i}].exitCode must be an integer or null.`);
    });
  }
  return errors;
}

module.exports = { validateSessionBundle };
