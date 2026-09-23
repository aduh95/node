#!/usr/bin/env python3
"""Summarize a Node.js CHANGELOG_*.md file as JSON.

Usage: changelog_stats.py <path/to/CHANGELOG_VXX.md>

Output: [{"version": "25.9.0", "date": "2026-04-01", "commitCount": 123}, ...]

Commits are counted only inside "Commits" sections (`### Commits`,
`### Semver-Minor Commits`, ...) so entries repeated under "Notable Changes"
are not double-counted. Major releases (x.0.0) are excluded.
"""
import json
import re
import sys

# e.g. "## 2026-04-01, Version 25.9.0 (Current), @aduh95"
RELEASE_RE = re.compile(r'^## (\d{4}-\d{2}-\d{2}), Version (\d+\.(?:[1-9]\d*\.\d+|0\.[1-9]\d*))')
HEADING_RE = re.compile(r'^(#{2,6})\s+(.*)')
COMMITS_HEADING_RE = re.compile(r'\bCommits\b')
# e.g. "* \[[`92ef2ad8fa`](https://github.com/nodejs/node/commit/92ef2ad8fa)] - ..."
COMMIT_RE = re.compile(r'^\* \\\[\[`[0-9a-f]+`\]')


def parse(path):
    releases = []
    current = None
    in_commits = False
    commits_level = 0
    with open(path, encoding='utf-8') as f:
        for line in f:
            m = RELEASE_RE.match(line)
            if m:
                date, version = m.groups()
                current = {'version': version, 'date': date, 'commitCount': 0}
                releases.append(current)
                in_commits = False
                continue
            if current is None:
                continue
            h = HEADING_RE.match(line)
            if h:
                level, title = len(h.group(1)), h.group(2)
                if COMMITS_HEADING_RE.search(title):
                    in_commits, commits_level = True, level
                elif level <= commits_level:
                    in_commits = False
            elif in_commits and COMMIT_RE.match(line):
                current['commitCount'] += 1
    return releases


def main(argv):
    if len(argv) != 2:
        print(__doc__, file=sys.stderr)
        return 1
    json.dump(parse(argv[1]), sys.stdout, indent=2)
    print()
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
