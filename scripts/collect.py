"""
collect.py — GitHub API data collector for The Signal Log.

Fetches real data for the target user via the GitHub REST and GraphQL APIs,
writes everything to data/raw.json.  On any failure the previous raw.json is
preserved so downstream scripts always have *something* to work with.

Environment variables
  GITHUB_TOKEN  — built-in Actions token (repos, user endpoint)
  GH_PAT        — classic PAT with read:user scope (contribution calendar)
  GH_USERNAME   — target GitHub username (default: shreyas123S)
"""

import json
import os
import shutil
import sys
import time
from pathlib import Path

try:
    import requests
except ImportError:
    print("ERROR: 'requests' package not installed. Run: pip install requests")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
USERNAME = os.environ.get("GH_USERNAME", "shreyas123S")
TOKEN = os.environ.get("GITHUB_TOKEN", os.environ.get("GH_PAT", ""))
PAT = os.environ.get("GH_PAT", TOKEN)  # prefer PAT for GraphQL
MAX_RETRIES = 3
RETRY_BACKOFF = 2  # seconds, multiplied by attempt number

RAW_PATH = Path("data/raw.json")
TMP_PATH = Path("data/_raw_tmp.json")

HEADERS = {}
if TOKEN:
    HEADERS["Authorization"] = f"token {TOKEN}"
HEADERS["Accept"] = "application/vnd.github+json"
HEADERS["User-Agent"] = "signal-log-collector"

PAT_HEADERS = {}
if PAT:
    PAT_HEADERS["Authorization"] = f"bearer {PAT}"
PAT_HEADERS["Content-Type"] = "application/json"
PAT_HEADERS["User-Agent"] = "signal-log-collector"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _check_rate_limit(response):
    """Abort early if rate limit is critically low."""
    remaining = response.headers.get("X-RateLimit-Remaining")
    if remaining is not None and int(remaining) < 5:
        reset = response.headers.get("X-RateLimit-Reset", "?")
        print(f"WARNING: Rate limit nearly exhausted ({remaining} remaining). "
              f"Resets at {reset}. Aborting gracefully.")
        return False
    return True


def rest_get(url):
    """GET with retry + backoff.  Returns parsed JSON or None."""
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            r = requests.get(url, headers=HEADERS, timeout=30)
            if r.status_code == 403 or r.status_code == 429:
                if not _check_rate_limit(r):
                    return None
            r.raise_for_status()
            if not _check_rate_limit(r):
                return r.json()  # still return data we got
            return r.json()
        except Exception as e:
            print(f"  REST attempt {attempt}/{MAX_RETRIES} failed for {url}: {e}")
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_BACKOFF * attempt)
    return None


def graphql_query(query_str):
    """POST to GitHub GraphQL with retry.  Returns data dict or None."""
    if not PAT:
        print("  No GH_PAT provided — skipping GraphQL (contribution calendar).")
        return None

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            r = requests.post(
                "https://api.github.com/graphql",
                headers=PAT_HEADERS,
                json={"query": query_str},
                timeout=30,
            )
            if r.status_code == 403 or r.status_code == 429:
                if not _check_rate_limit(r):
                    return None
            r.raise_for_status()
            body = r.json()
            if "errors" in body:
                print(f"  GraphQL errors: {body['errors']}")
                return None
            return body.get("data")
        except Exception as e:
            print(f"  GraphQL attempt {attempt}/{MAX_RETRIES} failed: {e}")
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_BACKOFF * attempt)
    return None


# ---------------------------------------------------------------------------
# Data collection
# ---------------------------------------------------------------------------
def collect():
    raw = {}

    # 1. User profile (REST) ---------------------------------------------------
    print(f"Fetching profile for @{USERNAME}...")
    user_data = rest_get(f"https://api.github.com/users/{USERNAME}")
    if user_data:
        raw["user"] = {
            "login": user_data.get("login"),
            "name": user_data.get("name"),
            "followers": user_data.get("followers", 0),
            "public_repos": user_data.get("public_repos", 0),
        }
        print(f"  ✓ Profile: {raw['user']['public_repos']} repos, "
              f"{raw['user']['followers']} followers")
    else:
        print("  ✗ Failed to fetch user profile")

    # 2. Repositories (REST) ---------------------------------------------------
    print("Fetching repositories...")
    repos_data = rest_get(
        f"https://api.github.com/users/{USERNAME}/repos"
        f"?per_page=100&type=owner&sort=pushed"
    )
    if repos_data:
        raw["repos"] = []
        for repo in repos_data:
            if repo.get("fork"):
                continue
            raw["repos"].append({
                "name": repo["name"],
                "description": repo.get("description"),
                "language": repo.get("language"),
                "stargazers_count": repo.get("stargazers_count", 0),
                "pushed_at": repo.get("pushed_at"),
                "created_at": repo.get("created_at"),
                "languages_url": repo.get("languages_url"),
            })
        print(f"  ✓ Found {len(raw['repos'])} non-fork repos")
    else:
        print("  ✗ Failed to fetch repositories")

    # 3. Per-repo languages (REST) ---------------------------------------------
    print("Fetching per-repo language bytes...")
    lang_bytes_all = {}
    if raw.get("repos"):
        for repo in raw["repos"]:
            lang_url = repo.get("languages_url")
            if not lang_url:
                continue
            lang_data = rest_get(lang_url)
            if lang_data:
                for lang, bytes_count in lang_data.items():
                    lang_bytes_all[lang] = lang_bytes_all.get(lang, 0) + bytes_count
        print(f"  ✓ Aggregated {len(lang_bytes_all)} languages")
    raw["language_bytes"] = lang_bytes_all

    # 4. Contribution calendar (GraphQL) ----------------------------------------
    print("Fetching contribution calendar (GraphQL)...")
    gql = f"""
    {{
      user(login: "{USERNAME}") {{
        contributionsCollection {{
          contributionCalendar {{
            totalContributions
            weeks {{
              contributionDays {{
                date
                contributionCount
              }}
            }}
          }}
        }}
      }}
    }}
    """
    gql_data = graphql_query(gql)
    if gql_data and gql_data.get("user"):
        cal = gql_data["user"]["contributionsCollection"]["contributionCalendar"]
        raw["contributions"] = {
            "totalContributions": cal["totalContributions"],
            "weeks": cal["weeks"],
        }
        print(f"  ✓ Contributions: {cal['totalContributions']} in the last year")
    else:
        print("  ✗ Failed to fetch contribution calendar (need GH_PAT with read:user)")

    return raw


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print("=" * 60)
    print("Signal Log — Data Collector")
    print("=" * 60)

    raw_data = collect()

    # Only write if we got meaningful data
    if not raw_data.get("user") and not raw_data.get("repos"):
        print("\nERROR: No meaningful data collected. Keeping previous raw.json.")
        sys.exit(1)

    # Write to tmp first, then move (atomic-ish)
    TMP_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(TMP_PATH, "w", encoding="utf-8") as f:
        json.dump(raw_data, f, indent=2, ensure_ascii=False)

    # Move tmp → final
    shutil.move(str(TMP_PATH), str(RAW_PATH))
    print(f"\n✓ Wrote {RAW_PATH} ({RAW_PATH.stat().st_size:,} bytes)")
