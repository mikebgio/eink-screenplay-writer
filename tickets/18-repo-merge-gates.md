---
id: 18
title: Merge gates on main
status: todo
blocked_by: [17]
model: haiku
plan: PLAN-2.md
---

# 18: Merge gates on main

**Read first:** `PLAN-2.md` → Track A spec, story 70, decision D7; ticket 17 Handoff notes.

## What to build

Make GitHub refuse to merge into `main` unless the `ci` job passed, and keep the gate settings in the repo so they can be reviewed and re-applied.

## Current state (checked 2026-11-14)

Ruleset `main` (id 27175451) on `mikebgio/eink-screenplay-writer` is active with three rules: no deletion, no force push, and "require a pull request" (0 approvals; merge, squash and rebase all allowed). **There is no required status check.**

## Decisions

- Put the wanted ruleset in the repo as `.github/rulesets/main.json`, in the shape the REST API accepts (`PUT /repos/{owner}/{repo}/rulesets/{id}`).
- Changes to the ruleset:
  - add a `required_status_checks` rule requiring the context **`ci`** (the job name from ticket 17), with `strict_required_status_checks_policy: false` (the branch doesn't have to be up to date: one writer, low risk, fewer re-runs)
  - set `allowed_merge_methods` to `["squash"]`
  - leave deletion, non-fast-forward and the 0-approval pull-request rule as they are
  - no bypass actors
- Add `scripts/apply-ruleset.sh`: one `gh api --method PUT … --input .github/rulesets/main.json` call, then a `gh api … --jq` read-back that prints the rules. **The agent writes the script; the owner runs it**, because changing branch protection needs the owner's say-so.
- Dependabot PRs go through the same gate (they already run CI).
- Document the gates in `README.md` under a short *Contributing* section: PRs only, `ci` must pass, squash merge, run `npm run check` first.

## Acceptance criteria

- [ ] `.github/rulesets/main.json` describes the full wanted ruleset; `scripts/apply-ruleset.sh` applies it and prints the result.
- [ ] `README.md` has the *Contributing* section.
- [ ] (manual) The owner runs `scripts/apply-ruleset.sh`; the read-back shows the `required_status_checks` rule with context `ci` and squash as the only merge method.
- [ ] (manual) A test PR with a failing check shows the merge button blocked; after the fix it can be merged. (The failing-test PR from ticket 17 can be reused.)

## Out of scope

Required reviews, CODEOWNERS, signed commits, tag protection (ticket 20 decides whether tags need it), organisation-level settings.

## Handoff notes

_(Fill in: the exact check context name as GitHub reports it, and anything the API rejected.)_
