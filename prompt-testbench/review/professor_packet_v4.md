<!-- title: Learning-Aware AI — Tutor Behavior Update -->

# Learning-Aware AI — Tutor Behavior Update

For Prof. Kshitij Sharma, from the student team. 28 Aug 2026.

Quick update on how the AI tutor is actually behaving, before we build it into the extension. This part is more of a judgment call than pure engineering, so we wanted your eyes on it.

- The AI is supposed to act like a TA, not a homework machine. It should always help with real syntax questions, but never give away an assignment's actual answer, and never let the student know it's holding something back. Even a polite "I can't help with that" is a hint, so it has to redirect without sounding like it's redirecting.
- We don't have your real course assignments yet, so we tested against a simple stand in problem (checking if a word reads the same backwards) with about 20 realistic student questions: normal syntax asks, direct "just give me the answer" asks, the same ask dressed up in fancier phrasing, a student pasting broken code and asking what's wrong, and a few students trying to pressure it into slipping up.
- We built a small test setup to run all of this automatically, check every response by hand too, and improve it round by round instead of just guessing.

How the four rounds went:

- **Round 1**: 75% correct. Already great at never revealing it was holding back. The mistake was combining two harmless explanations, like "how to reverse a sequence" and "how to compare two values", into a response that together handed over the answer.
- **Round 2**: dropped to 70%. We told it to self check whether its answer added up to a solution. It got paranoid and started saying things like "I can help with syntax rules", which itself gives away that there's a boundary.
- **Round 3**: back to 75%. Swapped the vague self check for specific named rules. Fixed one leak, but now when it had nothing relevant to say, it just pasted the same random unrelated code snippet every time. Obvious dodge.
- **Round 4**: 85%, our best. Told it to give a real, well explained answer about something else instead of a random snippet, and to treat technical sounding asks ("what's the algorithm for this") the same as a direct "give me the code" ask. It now never leaks the actual answer, on any test we threw at it.

One thing is still unresolved, and it's more a values question than a bug:

- When a student asks in a technical way, like "what's the algorithm to check this", the AI correctly avoids the answer but does it by jumping to a totally unrelated topic. Nothing leaks, but it can feel like it's dodging a fair question, since this phrasing sounds like something a tutor should just explain.
- Example: student asks "what's the algorithm to check if a string is a palindrome?" and the AI responds with how to check if a string contains only digits. Safe, but not satisfying.
- Since you mentioned this will be a first course in Java or Python, we also tried the same 4th round instructions against two more classic beginner problems (FizzBuzz and a factorial method) instead of just the one we started with. Same result: it never leaked the answer, and the same one issue showed up again on the same type of question. So this isn't specific to one assignment, it's a general pattern with this particular phrasing of question.

What we'd love your take on:

- Keep it fully redirecting with zero acknowledgment (what it does now). Safe, but can feel abrupt.
- Let it use one short, generic line first, like "that's a bit more than I can walk you through directly, but here's something related", without ever saying what it's declining or why. Haven't tried this yet.
- Or something else you'd rather it do.

Once we hear back we'll test your preferred option, then move on to building this into the actual VS Code extension.
