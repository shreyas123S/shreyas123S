"""
render_svg.py — Renders SVG assets from processed.json using Jinja2 templates.

Reads:  data/processed.json
Writes: assets/svg/sparkline.svg
        assets/svg/languages.svg
        assets/svg/signal-stats.svg

Never touches the network.
"""

import json
import sys
from pathlib import Path

try:
    from jinja2 import Environment, FileSystemLoader
except ImportError:
    print("ERROR: 'Jinja2' package not installed.  Run: pip install Jinja2")
    sys.exit(1)

PROCESSED_PATH = Path("data/processed.json")
TEMPLATE_DIR = Path("templates")
OUTPUT_DIR = Path("assets/svg")

# GitHub language colors (fallback palette)
LANG_COLORS = {
    "Python": "#3572A5",
    "JavaScript": "#f1e05a",
    "TypeScript": "#3178c6",
    "Java": "#b07219",
    "C++": "#f34b7d",
    "C": "#555555",
    "C#": "#178600",
    "HTML": "#e34c26",
    "CSS": "#563d7c",
    "Ruby": "#701516",
    "Go": "#00ADD8",
    "Rust": "#dea584",
    "Shell": "#89e051",
    "Jupyter Notebook": "#DA5B0B",
    "Kotlin": "#A97BFF",
    "Swift": "#F05138",
    "Dart": "#00B4AB",
    "PHP": "#4F5D95",
    "R": "#198CE7",
    "Scala": "#c22d40",
    "Lua": "#000080",
    "Vim Script": "#199f4b",
    "Makefile": "#427819",
    "Dockerfile": "#384d54",
    "SCSS": "#c6538c",
}


def load_processed():
    if not PROCESSED_PATH.exists():
        print(f"ERROR: {PROCESSED_PATH} not found.  Run process.py first.")
        sys.exit(1)
    with open(PROCESSED_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def render_sparkline(env, data):
    """Generate the 26-week contribution sparkline."""
    weekly = data.get("weekly_totals", [])
    if not weekly:
        print("  ⚠ No weekly data — sparkline will be empty")
        # Still generate an empty SVG
        weekly = [{"week_start": "", "total": 0}]

    max_val = max((w["total"] for w in weekly), default=1) or 1

    # Chart area: x from 50 to 660, y from 25 to 95
    x_start, x_end = 50, 660
    y_top, y_bottom = 25, 95
    x_range = x_end - x_start
    y_range = y_bottom - y_top

    points = []
    for i, w in enumerate(weekly):
        x = x_start + (i / max(len(weekly) - 1, 1)) * x_range
        # Invert y: higher value = higher on chart
        y = y_bottom - (w["total"] / max_val) * y_range
        points.append({"x": round(x, 1), "y": round(y, 1)})

    last_value = weekly[-1]["total"] if weekly else 0

    tmpl = env.get_template("sparkline.svg.j2")
    return tmpl.render(
        points=points,
        max_value=max_val,
        last_value=last_value,
    )


def render_languages(env, data):
    """Generate the stacked language bar."""
    languages = data.get("languages", [])

    # Attach colors
    for lang in languages:
        lang["color"] = LANG_COLORS.get(lang["name"], "#8b949e")

    tmpl = env.get_template("languages.svg.j2")
    return tmpl.render(languages=languages)


def render_stats(env, data):
    """Generate the compact stat row."""
    tmpl = env.get_template("signal-stats.svg.j2")
    return tmpl.render(
        streak=data.get("current_streak"),
        repos=data.get("public_repos"),
        followers=data.get("followers"),
    )


def main():
    print("=" * 60)
    print("Signal Log — SVG Renderer")
    print("=" * 60)

    data = load_processed()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    env = Environment(
        loader=FileSystemLoader(str(TEMPLATE_DIR)),
        autoescape=False,  # SVG output, not HTML
        keep_trailing_newline=True,
    )

    # 1. Sparkline
    svg = render_sparkline(env, data)
    out = OUTPUT_DIR / "sparkline.svg"
    out.write_text(svg, encoding="utf-8")
    print(f"  ✓ {out}")

    # 2. Languages
    svg = render_languages(env, data)
    out = OUTPUT_DIR / "languages.svg"
    out.write_text(svg, encoding="utf-8")
    print(f"  ✓ {out}")

    # 3. Signal stats
    svg = render_stats(env, data)
    out = OUTPUT_DIR / "signal-stats.svg"
    out.write_text(svg, encoding="utf-8")
    print(f"  ✓ {out}")

    print(f"\n✓ All SVGs written to {OUTPUT_DIR}/")


if __name__ == "__main__":
    main()
