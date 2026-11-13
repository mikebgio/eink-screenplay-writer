# Review cycle: the PR reviewer

In each cycle, a reviewer that knows nothing about how the code was written reviews the open PR. It runs `/code-review <level> --fix --comment <PR>`, then pushes its fixes to the PR. The reviewer is defined in [`.claude/agents/pr-reviewer.md`](../.claude/agents/pr-reviewer.md). It sees only the PR's state on origin.

**Rule:** the brief contains the PR number, the review level and nothing else. Don't pass summaries, design notes or the author session's conversation. A review that knows how the code was written stops being a newcomer's review.

## Defaults and how to change them

| Setting      | Default  | Set in                    | Change for one run                                                  |
| ------------ | -------- | ------------------------- | ------------------------------------------------------------------- |
| Model        | `opus`   | agent frontmatter         | `sonnet` (see the recipes below)                                    |
| Effort       | `medium` | agent frontmatter         | `effort` parameter / `--effort` flag                                |
| Review level | `medium` | agent body (from the brief) | write `Level: high` (or `low`, `xhigh`) in the brief            |

`opus` is an alias, not a pinned ID. On the Anthropic API it always resolves to the newest Opus, so the reviewer moves to new Opus models on its own. Only use review level `max` or `ultra` when the owner asks for it. Both cost far more.

## Recipe A: a sub-session (preferred)

From the prime session, call `start_session`:

```json
{
  "initiation": "user_asked",
  "title": "Review PR 7",
  "name": "review-pr7",
  "context": "fresh",
  "use_worktree": true,
  "prompt": "Act as the pr-reviewer agent: read `.claude/agents/pr-reviewer.md` and follow it exactly. PR: 7. Level: medium.",
  "background": "Independent newcomer review of an open PR in this repo. The reviewer works only from the PR's state on origin and the repo's own docs, never from the author's context."
}
```

- **`context: "fresh"`** is required. `"fork"` would hand over the prime session's whole conversation, author context included.
- **`use_worktree: true`** gives the reviewer its own worktree. It checks out the PR head detached (`git switch --detach origin/<head>`), so it doesn't clash with the author's worktree, which already has the branch checked out.
- **Model:** a sub-session can't be started *as* an agent, so frontmatter `model: opus` doesn't apply. Leave `model` out and the session inherits the prime session's model, which is Opus when prime runs on `opus`. For Sonnet, pass the current Sonnet model ID in `model` (for example `claude-sonnet-5-5`). `start_session` takes an ID, and only one in the same family as the prime model or cheaper.
- **Effort:** leave it out to inherit prime's effort, or pass `"effort": "medium"`. It can't be higher than prime's effort.
- **Review level:** set in the brief (`Level: high`).

### How a fix reaches the PR

`/code-review --fix` only edits the working tree. It doesn't commit or push. The reviewer then:

1. commits the fixes on the detached PR head;
2. runs `git push origin HEAD:<headRefName>` through the terminal tool, because the Bash sandbox can't write `.git` or sign in to `gh`;
3. waits for the owner to approve the SSH push prompt on their Mac.

The push adds a commit to the PR's head branch, so the open PR updates in place. The prime session then pulls the branch before it continues. The inline comments come from `--comment` and are posted directly to the PR.

If the PR comes from a fork (`isCrossRepository`), the reviewer can't push. It runs with `--comment` only and says so.

## Recipe B: the Agent tool (no full session)

Use this when you don't need a session you can open, steer or stop:

```json
{
  "subagent_type": "pr-reviewer",
  "description": "Review PR 7",
  "prompt": "PR: 7. Level: medium."
}
```

- Frontmatter applies here: `model: opus`, `effort: medium`.
- **Sonnet for one run:** add `"model": "sonnet"`. The Agent tool takes only family aliases here, and they override the frontmatter.
- **Effort for one run:** add `"effort": "high"` (or `low` and so on). This overrides the frontmatter but loses to the `CLAUDE_CODE_EFFORT_LEVEL` environment variable.
- The subagent runs in the caller's checkout unless you pass `"isolation": "worktree"`. Pass it, so the detached checkout doesn't move the prime session's branch.
- A subagent can start from the caller's context in two ways: with `subagent_type: "fork"`, or if the prompt carries that context. Never do either for this agent.

## Recipe C: the CLI

```bash
claude --agent pr-reviewer "PR: 7. Level: medium."
```

```bash
claude --agent pr-reviewer --model sonnet --effort medium "PR: 7. Level: high."
```

## Not verified in the docs

These are written down so a failure is easy to diagnose:

- **Calling `/code-review` from a subagent.** The docs say subagents can call skills through the Skill tool, but they don't say this for bundled skills such as `/code-review` by name. If it's refused, the agent stops and reports it rather than writing its own review. In that case, use Recipe A or C, where the session itself runs `/code-review`.
- **How `/code-review <PR>` reads the PR.** The docs don't say whether it checks out the PR or reads the diff through `gh`. The agent checks out the PR head first either way, so `--fix` edits the right files.
- **`gh` calls inside `/code-review --comment`.** These run inside the skill. If the sandbox refuses them, the comments won't post. The agent reports that, and the reviewer can rerun the review from a terminal session.
