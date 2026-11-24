#!/usr/bin/env bash
# Applies .github/rulesets/main.json to the main-branch ruleset on GitHub, then prints the rules read back.
# The owner runs this: it changes branch protection. Needs `gh auth login` as a repo admin.
#   scripts/apply-ruleset.sh
set -euo pipefail

REPO="${REPO:-mikebgio/eink-screenplay-writer}"
RULESET_ID="${RULESET_ID:-27175451}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

gh api --method PUT "repos/$REPO/rulesets/$RULESET_ID" --input "$ROOT/.github/rulesets/main.json" --jq '"Applied \(.name) (id \(.id)), enforcement \(.enforcement)"'

echo "Rules on GitHub now:"
gh api "repos/$REPO/rulesets/$RULESET_ID" --jq '.rules[] | "\(.type) \(.parameters // {} | tojson)"'
