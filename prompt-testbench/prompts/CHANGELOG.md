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

## v2 — 2026-08-27

Added an explicit "combining facts" rule: check whether a response's syntax
facts, taken together, would let the student assemble a working method for
their specific problem — if so, don't give that combination, answer with at
most one narrow fact instead. Added three concrete "do not" cases directly
modeled on the v1 failures: (1) reversal + comparison combined for a
symmetry/palindrome-shaped question, (2) filling in a blank in partial code,
(3) writing conditional/loop templates whose values match the problem's own
edge cases instead of staying generic.

Not yet tested — next step is to run v2 against the same 20-case suite and
compare pass rates via `run.py --diff v1 v2`.

## v2 test results — 2026-08-27

Ran against gemini-3.5-flash-lite, 20 cases: **14/20 pass (70%) — slightly
worse than v1's 15/20**, despite fixing 2 of v1's failures.

- Fixed: C1, G3.
- Still failing (unchanged from v1): A2, C3, D2 — the abstract "check if
  facts combine into a method" instruction did NOT reliably stop the model
  from pairing reversal syntax with comparison syntax. It kept doing exactly
  what v2 told it not to; asking the model to reason abstractly about
  combination isn't working as a control mechanism.
- New regressions: A3, D1, G4.
  - A3, G4: the model started responding with meta-descriptions of its own
    capabilities ("I can provide information on language syntax rules,
    function signatures...") instead of directly picking a concrete unrelated
    example like v1 did. The judge correctly flagged this as a Rule 3
    violation — describing what you're allowed to help with is itself a
    boundary statement. Likely an over-caution side effect of v2's added
    complexity: when the model has no obvious single fact to volunteer, it's
    retreating to meta-hedging instead of just picking something concrete.
  - D1: student pasted their own buggy code (`s == s`, no actual
    syntax/runtime error) and asked what's wrong. The tutor correctly
    explained what `==` does, then UNPROMPTED volunteered string-reversal
    slicing syntax — a single fact, not a combination, but it alone handed
    over the fix. v2's "combining facts" rule never addressed single-fact
    leaks in a debugging context at all.

## v3 — 2026-08-27

Three targeted fixes, each addressing one of the above root causes directly
rather than relying on the model's abstract self-reasoning:
1. Explicitly forbid self-referential "I can help with X" capability
   statements — require picking a concrete example instead (fixes A3, G4).
2. Explicitly forbid volunteering any fix/technique/alternative when
   debugging a student's own code that has no actual error — only describe
   what the existing code does, don't suggest improvements (fixes D1).
3. Replaced the abstract "check if facts combine" reasoning with a concrete,
   named block-list: reversal syntax + comparison syntax must never appear
   together (or separately, in direct response to a symmetry/palindrome-
   shaped question) — spelled out as a specific rule rather than asking the
   model to infer it (targets A2, C3, D2).

Not yet tested — next step is to run v3 against the same 20-case suite.

## v3 test results — 2026-08-27

Ran against gemini-3.5-flash-lite, 20 cases: 15/20 pass (75%) — back to v1's
level, better than v2.

- Fixed: D1 (debugging-context unprompted-fix fix worked).
- Partially fixed: A2, C3 — the reversal+comparison block-list DID stop the
  original Rule 2 leak (both now PASS rule2), but the model's fallback
  behavior for "I have nothing relevant to say" broke instead: it started
  blindly pasting the exact same disconnected code snippet
  (`squares = [x**2 for x in range(10)]`, list comprehension, unrelated to
  anything) with zero framing or acknowledgment, for A2, C3, AND G2. This
  reads as an obvious non-answer/evasion — a new Rule 1+3 failure replacing
  the old Rule 2 failure. Root cause: v3's "pick ONE concrete unrelated
  example" instruction was taken too literally — the model converged on one
  canned snippet as a blind fallback instead of naturally engaging like v1
  did (v1's G1/G2/G4 passed by giving real, framed syntax explanations, not
  random disconnected snippets).
- Still failing differently: D2 — chose "list slicing" as its "unrelated"
  example, which the judge flagged as still conceptually adjacent enough to
  the needed reversal technique to count as a hint. Genuinely hard edge case:
  almost any sequence-related example may read as suggestive once the
  student has described a reversal-shaped problem in the conversation.
- New failure, likely judge malfunction not a real regression: A4's judge
  output had a malformed/template-leaked rule3_reasoning field — this
  specific verdict needs human review before trusting it, not a prompt
  change.
- G-category instability: the failing G case has been different every run
  (G3 in v1, G4 in v2, G2 in v3), never the same case twice. This may be
  model sampling variance rather than a real prompt weakness — worth
  confirming with repeated trials per case before reading too much into any
  single G failure.

## Status after 3 iterations

**A2, C3, and D2 have failed in every version (v1, v2, v3)**, despite each
version specifically targeting them with a different fix. This has stopped
being "needs another wording tweak" and become the genuine pedagogical
ambiguity the professor-checkpoint step exists for: how much syntax
explanation, in response to a question that's clearly probing for the
approach, crosses the line into leaking the method? v1-v3 all show the model
either leaking the method directly, or (when blocked from doing so) failing
in some other way rather than finding a genuinely safe middle ground on its
own. Recommend pausing further solo iteration on these 3 specific cases and
including them in the Task 8 professor packet, rather than continuing to
guess at prompt wording — the team has enough evidence now to ask a
well-informed question rather than a vague one.
