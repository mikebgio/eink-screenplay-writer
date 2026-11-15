#!/usr/bin/env node
// CHANGELOG.md checks. The rules themselves are in CLAUDE.md.
//
//   node scripts/changelog.mjs --check-format      structural checks on CHANGELOG.md (part of `npm run check`)
//   node scripts/changelog.mjs --check-pr <number> [Unreleased] has a line linking PR <number> (CI, pull_request only)
//   node scripts/changelog.mjs --notes <X.Y.Z>      print that section's body: the release notes (release workflow)
//
// --check-pr reads the event payload from GITHUB_EVENT_PATH when set, and passes without an entry when the
// PR has the `no-changelog` label, was opened by dependabot[bot], or is a release PR: it changes `version`
// in package.json (compared with the payload's base commit) and CHANGELOG.md has a dated section for the
// new version, which only `npm run release:prepare` writes.
//
// Exit codes: 0 pass, 1 check failed, 2 usage error.
// No dependencies.

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export const REPO_URL = "https://github.com/mikebgio/eink-screenplay-writer";
export const GROUPS = ["Added", "Changed", "Deprecated", "Removed", "Fixed", "Security"];
export const NO_CHANGELOG_LABEL = "no-changelog";
export const DEPENDABOT = "dependabot[bot]";

const RELEASE_HEADING = /^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})$/;
const LINK_REF = /^\[[^\]]+\]:\s+\S+/;
// The trailing "([#N](url))" or "([#N](url), [#M](url))" of an entry line.
const TRAILING_LINKS = /\((\[#\d+\]\([^)\s]+\)(?:, \[#\d+\]\([^)\s]+\))*)\)$/;
const PR_LINK = /\[#(\d+)\]\(([^)\s]+)\)/g;

/**
 * @typedef {{ text: string, index: number, prs: number[] }} Entry
 * @typedef {{ name: string, index: number, entries: Entry[] }} Group
 * @typedef {{ name: string, date: string | null, heading: string, index: number, end: number, groups: Group[], loose: Entry[] }} Release
 * @typedef {{ lines: string[], releases: Release[], linksStart: number }} Changelog
 */

/**
 * Split CHANGELOG.md into releases (`## ` headings), groups (`### ` headings) and entries (`- ` lines).
 * Line indexes are 0-based into `lines`. `linksStart` is where the link references at the bottom begin.
 * @param {string} text
 * @returns {Changelog}
 */
export function parseChangelog(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let linksStart = lines.length;
  while (linksStart > 0 && (LINK_REF.test(lines[linksStart - 1]) || lines[linksStart - 1].trim() === "")) linksStart--;
  while (linksStart < lines.length && !LINK_REF.test(lines[linksStart])) linksStart++;

  /** @type {Release[]} */
  const releases = [];
  /** @type {Release | null} */
  let release = null;
  /** @type {Group | null} */
  let group = null;
  for (let i = 0; i < linksStart; i++) {
    const line = lines[i];
    if (line.startsWith("## ")) {
      if (release) release.end = i;
      const m = line.match(/^## \[([^\]]+)\](?: - (\S+))?/);
      release = { name: m ? m[1] : line.slice(3).trim(), date: m?.[2] ?? null, heading: line, index: i, end: linksStart, groups: [], loose: [] };
      releases.push(release);
      group = null;
    } else if (!release) {
      continue;
    } else if (line.startsWith("### ")) {
      group = { name: line.slice(4).trim(), index: i, entries: [] };
      release.groups.push(group);
    } else if (line.startsWith("- ")) {
      const entry = { text: line, index: i, prs: entryPrs(line) };
      (group ? group.entries : release.loose).push(entry);
    }
  }
  return { lines, releases, linksStart };
}

/** PR numbers linked at the end of an entry line. @param {string} line */
export function entryPrs(line) {
  const m = line.match(TRAILING_LINKS);
  if (!m) return [];
  return [...m[1].matchAll(PR_LINK)].map((l) => Number(l[1]));
}

/** @param {string} a @param {string} b */
function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

/**
 * Structural checks. Returns a list of problems, each starting with its line number; empty means the file passes.
 * @param {string} text
 * @param {{ repoUrl?: string }} [opts]
 */
export function checkFormat(text, opts = {}) {
  const repoUrl = opts.repoUrl ?? REPO_URL;
  const cl = parseChangelog(text);
  /** @type {string[]} */
  const errors = [];
  /** @param {number} index @param {string} msg */
  const err = (index, msg) => errors.push(`line ${index + 1}: ${msg}`);

  const first = cl.releases[0];
  if (!first || first.heading !== "## [Unreleased]") {
    if (cl.releases.some((r) => r.heading === "## [Unreleased]")) err(first.index, "`## [Unreleased]` must be the first section");
    else errors.push("missing `## [Unreleased]` section (it must be the first `## ` heading)");
  }

  /** @type {Map<number, number[]>} */
  const prLines = new Map();
  /** @type {string | null} */
  let previous = null;
  for (const r of cl.releases) {
    if (r.heading !== "## [Unreleased]") {
      const m = r.heading.match(RELEASE_HEADING);
      if (!m) {
        err(r.index, `release heading must be \`## [X.Y.Z] - YYYY-MM-DD\`, found \`${r.heading}\``);
      } else {
        if (previous && compareVersions(m[1], previous) >= 0) err(r.index, `releases must be newest first: ${m[1]} comes after ${previous}`);
        previous = m[1];
      }
    }
    for (const g of r.groups) {
      if (!GROUPS.includes(g.name)) err(g.index, `section \`### ${g.name}\` is not one of ${GROUPS.join(", ")}`);
    }
    for (const e of r.loose) err(e.index, "entry is not under a `### ` section heading");
    for (const e of [...r.loose, ...r.groups.flatMap((g) => g.entries)]) {
      const m = e.text.match(TRAILING_LINKS);
      if (!m) {
        err(e.index, `entry must end with its PR link, like ([#N](${repoUrl}/pull/N))`);
        continue;
      }
      for (const l of m[1].matchAll(PR_LINK)) {
        const n = Number(l[1]);
        if (l[2] !== `${repoUrl}/pull/${n}`) err(e.index, `link text #${n} doesn't match its URL ${l[2]} (expected ${repoUrl}/pull/${n})`);
        prLines.set(n, [...(prLines.get(n) ?? []), e.index]);
      }
    }
  }
  for (const [n, idx] of prLines) {
    if (idx.length > 2) err(idx[2], `PR #${n} has ${idx.length} lines (lines ${idx.map((i) => i + 1).join(", ")}); a PR may add at most two`);
  }
  return errors;
}

/**
 * @typedef {{ pull_request?: { number?: number, title?: string, user?: { login?: string }, labels?: { name: string }[] } }} PrEvent
 * @typedef {{ ok: boolean, message: string }} CheckResult
 */

/**
 * Does [Unreleased] have a line for this PR? Exemptions come from the event payload.
 * @param {string} text
 * @param {number} number
 * @param {PrEvent | null} [event]
 * @param {{ repoUrl?: string, newVersion?: string | null }} [opts] newVersion: the PR changes `version` in package.json to this
 * @returns {CheckResult}
 */
export function checkPr(text, number, event, opts = {}) {
  const repoUrl = opts.repoUrl ?? REPO_URL;
  const pr = event?.pull_request;
  const parsed = parseChangelog(text);
  // A version bump alone isn't a release PR: CHANGELOG.md must also have the new version's dated section.
  if (opts.newVersion && parsed.releases.some((r) => r.name === opts.newVersion && r.date)) {
    return { ok: true, message: `PR #${number} releases v${opts.newVersion}: no CHANGELOG entry needed.` };
  }
  if (pr?.labels?.some((l) => l.name === NO_CHANGELOG_LABEL)) {
    return { ok: true, message: `PR #${number} has the \`${NO_CHANGELOG_LABEL}\` label: no CHANGELOG entry needed.` };
  }
  if (pr?.user?.login === DEPENDABOT) {
    return { ok: true, message: `PR #${number} is from Dependabot: no CHANGELOG entry needed (the release script adds one).` };
  }
  const unreleased = parsed.releases.find((r) => r.heading === "## [Unreleased]");
  const found = unreleased?.groups.some((g) => g.entries.some((e) => e.prs.includes(number)));
  if (found) return { ok: true, message: `CHANGELOG.md has an entry for PR #${number}.` };
  const line = `- ${pr?.title?.replace(/^\d+(, \d+)*: /, "") || "What is different now, for the person using the app"} ([#${number}](${repoUrl}/pull/${number}))`;
  return {
    ok: false,
    message: [
      `CHANGELOG.md has no entry for PR #${number}.`,
      "",
      "Add one line under `## [Unreleased]`, at the bottom of the right section (Added, Changed, Deprecated, Removed, Fixed or Security), for example:",
      "",
      `    ${line}`,
      "",
      "The rules are in CLAUDE.md (CHANGELOG section).",
      ...(opts.newVersion
        ? [`This PR changes the version to ${opts.newVersion}, but CHANGELOG.md has no dated [${opts.newVersion}] section: only \`npm run release:prepare\` should change the version.`]
        : []),
      `If this PR needs no entry (it only changes tickets, plans or comments, or only ticks owner checks), add the \`${NO_CHANGELOG_LABEL}\` label instead.`,
    ].join("\n"),
  };
}

/**
 * The PR's new `version` from package.json, or null when it doesn't change it. Compares the checked-out file
 * with the base commit from the event payload (the workflow fetches that commit first). Null when the base
 * can't be read.
 * @param {PrEvent & { pull_request?: { base?: { sha?: string } } } | null} event
 * @returns {string | null}
 */
function newVersion(event) {
  const sha = event?.pull_request?.base?.sha;
  if (!sha || !/^[0-9a-f]{7,40}$/.test(sha)) return null;
  try {
    const base = JSON.parse(execFileSync("git", ["show", `${sha}:package.json`], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
    const head = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    return base.version !== head.version ? String(head.version) : null;
  } catch {
    return null;
  }
}

/**
 * The body of one section (`Unreleased` or `X.Y.Z`) without its heading: the release notes.
 * @param {string} text
 * @param {string} name
 */
export function sectionBody(text, name) {
  const cl = parseChangelog(text);
  const r = cl.releases.find((x) => x.name === name);
  if (!r) return null;
  return cl.lines.slice(r.index + 1, r.end).join("\n").trim();
}

/** @param {string[]} argv @param {NodeJS.ProcessEnv} env */
function main(argv, env) {
  const [mode, arg] = argv;
  const file = join(root, "CHANGELOG.md");
  if (mode === "--check-format") {
    const errors = checkFormat(readFileSync(arg ?? file, "utf8"));
    if (errors.length) {
      console.error(`CHANGELOG.md format problems (rules in CLAUDE.md):\n${errors.map((e) => `  ${e}`).join("\n")}`);
      return 1;
    }
    console.log("CHANGELOG.md format OK.");
    return 0;
  }
  if (mode === "--check-pr") {
    const number = Number(arg);
    if (!Number.isInteger(number) || number <= 0) {
      console.error("usage: node scripts/changelog.mjs --check-pr <PR number>");
      return 2;
    }
    const event = env.GITHUB_EVENT_PATH ? JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8")) : null;
    const result = checkPr(readFileSync(file, "utf8"), number, event, { newVersion: newVersion(event) });
    (result.ok ? console.log : console.error)(result.message);
    return result.ok ? 0 : 1;
  }
  if (mode === "--notes" && arg) {
    const body = sectionBody(readFileSync(file, "utf8"), arg);
    if (!body) {
      console.error(`CHANGELOG.md has no entries for ${arg}.`);
      return 1;
    }
    console.log(body);
    return 0;
  }
  console.error("usage: node scripts/changelog.mjs --check-format [file] | --check-pr <PR number> | --notes <X.Y.Z>");
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2), process.env));
}
