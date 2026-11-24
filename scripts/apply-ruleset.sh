#!/usr/bin/env bash
# Applies .github/rulesets/main.json to the main-branch ruleset on GitHub, then prints the result.
# The live ruleset is saved to a file first, so the previous settings can be restored by hand.
# The owner runs this: it changes branch protection. Needs `gh auth login` as a repo admin.
#   scripts/apply-ruleset.sh
set -euo pipefail

REPO="${REPO:-mikebgio/eink-screenplay-writer}"
RULESET_ID="${RULESET_ID:-27175451}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP="${TMPDIR:-/tmp}/ruleset-$RULESET_ID-before-$(date +%Y%m%d-%H%M%S).json"

gh api "repos/$REPO/rulesets/$RULESET_ID" > "$BACKUP"
echo "Saved the live ruleset to $BACKUP"

gh api --method PUT "repos/$REPO/rulesets/$RULESET_ID" --input "$ROOT/.github/rulesets/main.json" --jq '"Applied \(.name) (id \(.id)), enforcement \(.enforcement)"'

echo "Read back from GitHub:"
gh api "repos/$REPO/rulesets/$RULESET_ID" --jq '"conditions \(.conditions | tojson)", "bypass_actors \(.bypass_actors | tojson)", (.rules[] | "\(.type) \(.parameters // {} | tojson)")'
