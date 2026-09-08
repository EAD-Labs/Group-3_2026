#!/usr/bin/env python3
"""
Guarded-mode tutor prompt testbench.

Setup:
    pip install requests
    export GEMINI_API_KEY="your-key-from-aistudio.google.com"

Usage:
    python run.py --run v1                  # run prompts/v1.txt against the full catalog
    python run.py --report logs/v1_....jsonl # print pass/fail summary by category and rule
    python run.py --diff v1 v2               # diff two prompt versions + their latest logs

Model: set GEMINI_MODEL below if the default isn't available on your account —
check available models at https://aistudio.google.com.
"""

import argparse
import difflib
import hashlib
import json
import os
import random
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).parent
PROMPTS_DIR = ROOT / "prompts"
CATALOG_PATH = ROOT / "test_cases" / "catalog.json"
RUBRIC_PATH = ROOT / "judge_rubric.txt"
LOGS_DIR = ROOT / "logs"

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite")
API_KEY = os.environ.get("GEMINI_API_KEY")
API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

HUMAN_REVIEW_SAMPLE_RATE = 0.10  # random sample of PASSes flagged for human review

# Free-tier throttling: enforce a minimum gap between any two Gemini calls so we
# don't just immediately re-hit the per-minute quota. Override via env var if
# your account's actual limit differs from the observed 5 req/min.
MIN_CALL_INTERVAL_SECONDS = float(os.environ.get("GEMINI_MIN_INTERVAL", "5"))
_last_call_at = [0.0]


def _throttle():
    elapsed = time.monotonic() - _last_call_at[0]
    if elapsed < MIN_CALL_INTERVAL_SECONDS:
        time.sleep(MIN_CALL_INTERVAL_SECONDS - elapsed)


def call_gemini(system_instruction, conversation_turns, retries=6):
    """conversation_turns: list of {"role": "student"|"tutor", "text": str}
    Returns the model's text response for the next turn."""
    contents = []
    for turn in conversation_turns:
        role = "user" if turn["role"] == "student" else "model"
        contents.append({"role": role, "parts": [{"text": turn["text"]}]})

    body = {
        "system_instruction": {"parts": [{"text": system_instruction}]},
        "contents": contents,
    }
    for attempt in range(retries):
        _throttle()
        try:
            resp = requests.post(API_URL, params={"key": API_KEY}, json=body, timeout=60)
        except requests.exceptions.RequestException as e:
            _last_call_at[0] = time.monotonic()
            if attempt < retries - 1:
                wait = 2 ** attempt
                print(f"    (network error: {e.__class__.__name__}, retrying in {wait:.0f}s...)")
                time.sleep(wait)
                continue
            raise RuntimeError(f"Gemini API network error after {retries} attempts: {e}")
        _last_call_at[0] = time.monotonic()
        if resp.status_code == 200:
            data = resp.json()
            return data["candidates"][0]["content"]["parts"][0]["text"]
        if resp.status_code in (429, 503) and attempt < retries - 1:
            wait = 2 ** attempt
            m = re.search(r"retry in (\d+(?:\.\d+)?)s", resp.text)
            if m:
                wait = float(m.group(1)) + 2  # small buffer
            print(f"    (rate limited, waiting {wait:.0f}s...)")
            time.sleep(wait)
            continue
        raise RuntimeError(f"Gemini API error {resp.status_code}: {resp.text[:500]}")
    raise RuntimeError("Gemini API: exhausted retries")


FINAL_RESPONSE_MARKER = re.compile(r"FINAL_RESPONSE:\s*", re.IGNORECASE)


def extract_final_response(raw_text):
    """For prompts using the two-stage AUDIT / FINAL_RESPONSE format (v6+),
    strip the private audit section so only the student-visible reply is
    ever stored in conversation history, shown to the judge, or logged as
    the response. Falls back to the raw text unchanged if a prompt version
    doesn't use this format (no marker found)."""
    match = FINAL_RESPONSE_MARKER.search(raw_text)
    if not match:
        return raw_text.strip()
    return raw_text[match.end():].strip()


def parse_judge_response(raw_text):
    text = raw_text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        text = text.rsplit("```", 1)[0]
    return json.loads(text)


def run_suite(version):
    prompt_path = PROMPTS_DIR / f"{version}.txt"
    if not prompt_path.exists():
        sys.exit(f"No such prompt file: {prompt_path}")
    if not API_KEY:
        sys.exit("Set GEMINI_API_KEY before running.")

    system_prompt = prompt_path.read_text()
    prompt_hash = hashlib.sha256(system_prompt.encode()).hexdigest()[:12]
    rubric = RUBRIC_PATH.read_text()
    catalog = json.loads(CATALOG_PATH.read_text())

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    log_path = LOGS_DIR / f"{version}_{timestamp}.jsonl"

    print(f"Running {len(catalog['cases'])} cases against {version} ({prompt_hash}) -> {log_path}")

    with open(log_path, "w") as log_file:
        for case in catalog["cases"]:
            history = []
            tutor_response = None
            raw_full_response = None
            for turn in case["turns"]:
                if turn["role"] == "student":
                    history.append({"role": "student", "text": turn["text"]})
                    raw_full_response = call_gemini(system_prompt, history)
                    tutor_response = extract_final_response(raw_full_response)
                    history.append({"role": "tutor", "text": tutor_response})
                else:
                    history.append(turn)

            judge_input = (
                f"CONVERSATION:\n{json.dumps(history, indent=2)}\n\n"
                f"Evaluate the tutor's final response above per the rules."
            )
            judge_raw = call_gemini(rubric, [{"role": "student", "text": judge_input}])
            try:
                verdict = parse_judge_response(judge_raw)
            except (json.JSONDecodeError, KeyError):
                verdict = {
                    "rule1_verdict": "FAIL", "rule1_reasoning": f"unparseable judge output: {judge_raw[:200]}",
                    "rule2_verdict": "FAIL", "rule2_reasoning": "unparseable judge output",
                    "rule3_verdict": "FAIL", "rule3_reasoning": "unparseable judge output",
                }

            any_fail = "FAIL" in (verdict["rule1_verdict"], verdict["rule2_verdict"], verdict["rule3_verdict"])
            is_ghc = case["category"] in ("G", "H")
            sampled = random.random() < HUMAN_REVIEW_SAMPLE_RATE
            needs_human_review = any_fail or is_ghc or sampled

            record = {
                "run_id": f"{version}_{case['id']}_{timestamp}",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "prompt_version": version,
                "prompt_hash": prompt_hash,
                "test_case_id": case["id"],
                "test_category": case["category"],
                "conversation_turns": history,
                "raw_response": tutor_response,
                "raw_full_response": raw_full_response,
                "judge_model": GEMINI_MODEL,
                "judge_model_version": GEMINI_MODEL,
                "verdict_rule1": verdict["rule1_verdict"],
                "verdict_rule2": verdict["rule2_verdict"],
                "verdict_rule3": verdict["rule3_verdict"],
                "judge_reasoning": {
                    "rule1": verdict["rule1_reasoning"],
                    "rule2": verdict["rule2_reasoning"],
                    "rule3": verdict["rule3_reasoning"],
                },
                "human_reviewed": False,
                "human_verdict_rule1": None,
                "human_verdict_rule2": None,
                "human_verdict_rule3": None,
                "human_notes": None,
                "disagreement_flag": False,
                "needs_human_review": needs_human_review,
                "student_sim_type": "scripted",
                "persona_id": None,
            }
            log_file.write(json.dumps(record) + "\n")
            log_file.flush()

            status = "FAIL" if any_fail else "pass"
            flag = " [NEEDS HUMAN REVIEW]" if needs_human_review else ""
            print(f"  {case['id']:6s} {case['category']:2s} {status}{flag}")

    print(f"\nDone. Log written to {log_path}")
    print("Next: review every FAIL and every [NEEDS HUMAN REVIEW] line by hand before trusting this version.")


def report(log_path):
    records = [json.loads(l) for l in Path(log_path).read_text().splitlines() if l.strip()]
    by_category = {}
    for r in records:
        cat = r["test_category"]
        by_category.setdefault(cat, {"total": 0, "pass": 0, "needs_review": 0})
        by_category[cat]["total"] += 1
        if r["verdict_rule1"] == r["verdict_rule2"] == r["verdict_rule3"] == "PASS":
            by_category[cat]["pass"] += 1
        if r["needs_human_review"]:
            by_category[cat]["needs_review"] += 1

    print(f"Report for {log_path} ({len(records)} cases)\n")
    for cat, stats in sorted(by_category.items()):
        print(f"  Category {cat}: {stats['pass']}/{stats['total']} pass, {stats['needs_review']} flagged for human review")

    total_pass = sum(s["pass"] for s in by_category.values())
    total = sum(s["total"] for s in by_category.values())
    print(f"\n  Overall: {total_pass}/{total} pass ({100*total_pass/total:.0f}%)")


def diff_versions(v1, v2):
    p1 = (PROMPTS_DIR / f"{v1}.txt").read_text().splitlines(keepends=True)
    p2 = (PROMPTS_DIR / f"{v2}.txt").read_text().splitlines(keepends=True)
    print(f"--- {v1} vs {v2} (prompt text) ---")
    sys.stdout.writelines(difflib.unified_diff(p1, p2, fromfile=v1, tofile=v2))

    def latest_log(version):
        matches = sorted(LOGS_DIR.glob(f"{version}_*.jsonl"))
        return matches[-1] if matches else None

    l1, l2 = latest_log(v1), latest_log(v2)
    if l1 and l2:
        print(f"\n--- pass rate comparison ---")
        report(l1)
        print()
        report(l2)
    else:
        print("\n(no logs found for one or both versions — run each first)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", metavar="VERSION", help="run a prompt version against the full catalog")
    parser.add_argument("--report", metavar="LOG_FILE", help="print pass/fail summary for a log file")
    parser.add_argument("--diff", nargs=2, metavar=("V1", "V2"), help="diff two prompt versions + their latest logs")
    args = parser.parse_args()

    if args.run:
        run_suite(args.run)
    elif args.report:
        report(args.report)
    elif args.diff:
        diff_versions(*args.diff)
    else:
        parser.print_help()
