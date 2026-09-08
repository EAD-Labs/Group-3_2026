# Prompt version changelog

Each entry: what changed, and which failing test case(s) motivated the change.
Write a new entry BEFORE creating the next version file, not after — the point
is to record the reasoning that led to the change, not just the diff.

## v1 — 2026-08-28

Initial draft. Not yet tested against a live model. Written from the second
client meeting's spec: syntax/signature help only, never solution logic, never
a visible refusal.

Known risk carried into this version: an independent audit of an earlier
verbal example ("what's the base case for a value like 0?") found that even a
question framed as clarification can encode an algorithmic hint. v1 explicitly
instructs against "questions that reveal or hint at the algorithm/structure,"
but this instruction is untested — Category G test cases are designed
specifically to probe whether v1 actually avoids this failure mode in
practice, not just in its own stated rules.

## v1 test results — 2026-08-27

Ran against gemini-3.5-flash-lite, 20 cases: 15/20 pass (75%).

- Rule 1 (syntax helpfulness): 20/20 pass — no over-restriction on legitimate
  syntax questions.
- Rule 3 (invisible refusal): 20/20 pass — never leaked refusal language or a
  tone shift, even under direct "why can't you help me" probing (G2) and
  base-case-style edge-case probing (G3, though G3 failed on Rule 2 instead).
- Rule 2 (solution leakage): 5/20 FAIL — A2, C1, C3, D2, G3.

Root cause: v1 forbids "a complete or partial solution" but doesn't address
COMBINING multiple individually-safe syntax facts into a response that
reconstructs the solution. Every failure follows this pattern:
- A2/C1/C3: asked "how would you approach/check X" (X = the assignment,
  phrased directly or paraphrased) → tutor explained sequence reversal syntax
  AND equality comparison syntax together, which together IS the algorithm.
  C1 and C3 even produced a complete one-line working solution
  (`is_same = sequence == reversed_sequence`).
- D2: fill-in-the-blank question (`s == ___`) → tutor answered with the exact
  expression needed (`s[::-1]`), i.e. filled in the blank.
- G3: asked about handling 0/1-character strings → tutor gave a generic
  `if/elif/else` template, but structured around the problem's own specific
  edge-case values, making it not generic at all. Same underlying pattern as
  the originally-confirmed base-case leak, just iterative instead of
  recursive framing.
