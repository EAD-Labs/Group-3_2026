# Prompt Testbench

Standalone harness for developing and validating the guarded-mode tutor
system prompt (LAA-20). Independent of the extension code on purpose — see
`prompts/CHANGELOG.md` for the full round-by-round history (v1 through v7).

## Current status

**v7 is adopted — 97% (29/30), zero leaks.** See `prompts/CHANGELOG.md` for
the full reasoning behind every version, including the two rejected
experiments (v5, v6) kept on record.

## Layout

```
prompts/          v1.txt ... v7.txt (immutable per version) + CHANGELOG.md
test_cases/        catalog.json - 30 scripted test cases across 3 assignments
judge_rubric.txt    instructions for the LLM-judge scoring pass
run.py              orchestrator: --run <version>, --report <log>, --diff <v1> <v2>
logs/               raw JSONL run logs, one line per test case per run
review/             professor_packet_v4.md - plain-language summary sent to Prof. Sharma
```

## Usage

```
export GEMINI_API_KEY="..."
python3 run.py --run v7
python3 run.py --report logs/v7_<timestamp>.jsonl
python3 run.py --diff v4 v7
```

## Considerations before switching the underlying LLM model

The whole testbench exists because prompt behavior is model-specific — these
are the concrete things to check before assuming v7 (or any adopted version)
carries over to a different model, whether that's a different Gemini tier or
a different provider entirely.

1. **The pass rate does not transfer.** v7's 97% is tuned against how
   `gemini-3.5-flash-lite` specifically follows instructions. A new model
   needs the full 30-case suite rerun (`python3 run.py --run <version>`
   against the new model) before trusting any number for it — this is the
   same discipline that took the prompt from 75% to 97%, not optional.

2. **Format-compliance is a production risk, not just an accuracy metric.**
   v7's two-stage AUDIT / FINAL_RESPONSE format relies on `run.py`'s
   `extract_final_response()` finding a literal `FINAL_RESPONSE:` marker via
   regex. If a new model doesn't reliably emit that marker, the fallback
   returns the raw text unchanged — audit section included. That means the
   model's private reasoning about what it's blocking and why could leak
   straight to the student. Test this specifically, not just the pass rate,
   before ever deploying a new model with this prompt.

3. **Cost and latency roughly double or more.** The audit step means every
   reply costs 2x+ output tokens versus a single-shot answer. Cheap on a
   free/cheap tier; compounds fast on a premium model across real classroom
   volume.

4. **API request/response shape differs by provider.** Gemini's
   `system_instruction` + `contents` structure isn't how other providers
   take a system prompt. Switching providers (not just switching Gemini
   tiers) means rewriting the HTTP client (LAA-19), not just changing a
   model name string.

5. **Rate limits and quotas are model-specific and must be re-checked.**
   This project already hit a hard daily cap switching between Gemini
   models once (`gemini-3.6-flash` free tier vs. `gemini-3.5-flash-lite`) —
   any new model needs its own quota check against expected real classroom
   volume, not just testbench volume.

6. **Known gap in the harness**: `run.py` logs `judge_model` per test case
   but not the tutor model separately — fine while tutor and judge are the
   same model, but if a future run tests a different tutor model against a
   fixed judge, the log won't distinguish which model produced which
   response. Worth adding a `tutor_model` field before running a real
   model-swap experiment.
