"""
process.py — Transforms raw.json into processed.json for SVG rendering.

Computes:
  - Current streak (consecutive days with contributions, from most recent backward)
  - Longest streak
  - Weekly contribution totals for sparkline (last 26 weeks)
  - Language byte-share (top 5)
  - Repo count, follower count passthrough
  - Top repos by stars/recency

Reads: data/raw.json
Writes: data/processed.json
"""

import json
import shutil
import sys
from datetime import datetime, timedelta
from pathlib import Path

RAW_PATH = Path("data/raw.json")
OUT_PATH = Path("data/processed.json")
TMP_PATH = Path("data/_processed_tmp.json")


def load_raw():
    if not RAW_PATH.exists():
        print(f"ERROR: {RAW_PATH} not found.  Run collect.py first.")
        sys.exit(1)
    with open(RAW_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def compute_streaks(contributions):
    """Return (current_streak, longest_streak) from contribution calendar."""
    if not contributions or "weeks" not in contributions:
        return 0, 0

    # Flatten all days, sorted chronologically
    days = []
    for week in contributions["weeks"]:
        for day in week["contributionDays"]:
            days.append(day)
    days.sort(key=lambda d: d["date"])

    if not days:
        return 0, 0

    # Longest streak
    longest = 0
    running = 0
    for d in days:
        if d["contributionCount"] > 0:
            running += 1
            longest = max(longest, running)
        else:
            running = 0

    # Current streak (from the end, backward)
    # If today has 0 contributions, still check from yesterday
    # (today might not be over yet)
    current = 0
    today = datetime.utcnow().strftime("%Y-%m-%d")

    start_idx = len(days) - 1
    # If the most recent day is today and has 0 contributions,
    # start checking from yesterday
    if days[start_idx]["date"] == today and days[start_idx]["contributionCount"] == 0:
        start_idx -= 1

    for i in range(start_idx, -1, -1):
        if days[i]["contributionCount"] > 0:
            current += 1
        else:
            break

    return current, longest


def compute_weekly_totals(contributions, num_weeks=26):
    """Return list of {week_start, total} for the last `num_weeks` weeks."""
    if not contributions or "weeks" not in contributions:
        return []

    weeks = contributions["weeks"]
    # Take last N weeks
    recent = weeks[-num_weeks:] if len(weeks) >= num_weeks else weeks

    result = []
    for week in recent:
        days_in_week = week["contributionDays"]
        if not days_in_week:
            continue
        total = sum(d["contributionCount"] for d in days_in_week)
        week_start = days_in_week[0]["date"]
        result.append({"week_start": week_start, "total": total})

    return result


def compute_languages(language_bytes):
    """Return top 5 languages with percentage share."""
    if not language_bytes:
        return []

    total = sum(language_bytes.values())
    if total == 0:
        return []

    sorted_langs = sorted(language_bytes.items(), key=lambda x: x[1], reverse=True)
    top = sorted_langs[:5]

    return [
        {
            "name": name,
            "bytes": bytes_count,
            "percentage": round((bytes_count / total) * 100, 1),
        }
        for name, bytes_count in top
    ]


def compute_top_repos(repos):
    """Return list of notable repos sorted by stars then recency."""
    if not repos:
        return []

    # Filter out the profile repo itself and empty repos
    filtered = [
        r for r in repos
        if r["name"].lower() != "shreyas123s"
        and r["name"].lower() not in ("test", "student")
    ]

    # Sort by stars desc, then by pushed_at desc
    filtered.sort(
        key=lambda r: (r.get("stargazers_count", 0), r.get("pushed_at", "")),
        reverse=True,
    )

    return filtered[:5]


def process(raw):
    """Build the processed data structure."""
    processed = {}

    # User info
    user = raw.get("user", {})
    processed["username"] = user.get("login", "shreyas123S")
    processed["name"] = user.get("name") or "Shreyas S"
    processed["followers"] = user.get("followers")
    processed["public_repos"] = user.get("public_repos")

    # Contributions
    contributions = raw.get("contributions")
    current_streak, longest_streak = compute_streaks(contributions)
    processed["current_streak"] = current_streak
    processed["longest_streak"] = longest_streak
    processed["total_contributions"] = (
        contributions.get("totalContributions") if contributions else None
    )

    # Weekly sparkline data
    processed["weekly_totals"] = compute_weekly_totals(contributions)

    # Languages
    processed["languages"] = compute_languages(raw.get("language_bytes", {}))

    # Top repos
    processed["top_repos"] = compute_top_repos(raw.get("repos", []))

    # Primary languages (for the README text sections)
    if processed["languages"]:
        processed["primary_languages"] = [
            lang["name"] for lang in processed["languages"][:3]
        ]
    else:
        processed["primary_languages"] = []

    # Generated timestamp
    processed["generated_at"] = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    return processed


if __name__ == "__main__":
    print("=" * 60)
    print("Signal Log — Data Processor")
    print("=" * 60)

    raw = load_raw()
    result = process(raw)

    # Write atomically
    TMP_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(TMP_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    shutil.move(str(TMP_PATH), str(OUT_PATH))

    print(f"  Streak: {result['current_streak']}d current / "
          f"{result['longest_streak']}d longest")
    print(f"  Languages: {', '.join(l['name'] for l in result['languages'])}")
    print(f"  Top repos: {', '.join(r['name'] for r in result['top_repos'])}")
    print(f"\n✓ Wrote {OUT_PATH}")
