#!/usr/bin/env node
// Release tooling. A release is a merged PR that changes the version (PLAN-2.md, D8 and D9).
//
//   npm run release:prepare -- <patch|minor|major>
//       bump the version and turn [Unreleased] into a dated section; you commit and open the PR
//   node scripts/release.mjs --verify-apk <output-metadata.json>
//       exit 1 unless the APK Gradle built has versionName/versionCode from package.json (CI)
//   node scripts/release.mjs --summary <dir> <version> <release url>
//       print the release run summary (Markdown) for the packages in <dir> (release workflow)
//
// No dependencies besides `git`, `npm` and (for prepare) `gh`.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseChangelog, GROUPS, REPO_URL, NO_CHANGELOG_LABEL } from "./changelog.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** @param {string} version */
function parseVersion(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) throw new Error(`version must be X.Y.Z, got "${version}"`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/**
 * Android versionCode: major × 10000 + minor × 100 + patch. android/app/build.gradle computes the same.
 * Minor and patch must stay below 100 or codes would collide.
 * @param {string} version
 */
export function versionCode(version) {
  const [major, minor, patch] = parseVersion(version);
  if (minor > 99 || patch > 99) throw new Error(`minor and patch must be below 100 for versionCode, got ${version}`);
  return major * 10000 + minor * 100 + patch;
}

/**
 * @param {string} version
 * @param {string} kind patch | minor | major
 */
export function bumpVersion(version, kind) {
  const [major, minor, patch] = parseVersion(version);
  if (kind === "patch") return `${major}.${minor}.${patch + 1}`;
  if (kind === "minor") return `${major}.${minor + 1}.0`;
  if (kind === "major") return `${major + 1}.0.0`;
  throw new Error(`release kind must be patch, minor or major, got "${kind}"`);
}

/** @param {string} text */
function unreleased(text) {
  const cl = parseChangelog(text);
  const r = cl.releases.find((x) => x.name === "Unreleased");
  if (!r) throw new Error("CHANGELOG.md has no ## [Unreleased] section");
  return { cl, r };
}

/** @param {string} text */
export function unreleasedIsEmpty(text) {
  const { r } = unreleased(text);
  return r.loose.length === 0 && r.groups.every((g) => g.entries.length === 0);
}

/** @param {number} n */
const prLink = (n) => `[#${n}](${REPO_URL}/pull/${n})`;

/**
 * Add one "Update dependencies" line linking every Dependabot PR at the bottom of [Unreleased] › Changed,
 * creating the Changed section (in Keep a Changelog order) if there isn't one.
 * @param {string} text
 * @param {number[]} prs
 */
export function foldDependabot(text, prs) {
  if (!prs.length) return text;
  const { cl, r } = unreleased(text);
  const lines = [...cl.lines];
  const line = `- Update dependencies (${[...prs].sort((a, b) => a - b).map(prLink).join(", ")})`;
  const changed = r.groups.find((g) => g.name === "Changed");
  if (changed) {
    const last = changed.entries.at(-1);
    if (last) lines.splice(last.index + 1, 0, line);
    else lines.splice(changed.index + 1, 0, "", line);
  } else {
    // Insert before the first group that comes after Changed, or at the end of the section.
    const after = r.groups.find((g) => GROUPS.indexOf(g.name) > GROUPS.indexOf("Changed"));
    let at = after ? after.index : r.end;
    if (!after) while (at > r.index + 1 && lines[at - 1].trim() === "") at--;
    lines.splice(at, 0, ...(after ? ["### Changed", "", line, ""] : ["", "### Changed", "", line]));
  }
  return lines.join("\n");
}

/**
 * @typedef {{ number: number, title?: string, author?: { login?: string } | null, labels?: { name: string }[] }} MergedPr
 */

/**
 * Merged PRs with no CHANGELOG line and no `no-changelog` label. Dependabot PRs are returned separately (they
 * get folded into one line); everything else in `missing` stops the release. Release PRs are skipped.
 * @param {string} text
 * @param {MergedPr[]} prs
 */
export function findMissing(text, prs) {
  const cl = parseChangelog(text);
  const listed = new Set(cl.releases.flatMap((r) => [...r.loose, ...r.groups.flatMap((g) => g.entries)]).flatMap((e) => e.prs));
  /** @type {number[]} */
  const dependabot = [];
  /** @type {MergedPr[]} */
  const missing = [];
  for (const pr of prs) {
    if (listed.has(pr.number)) continue;
    if (pr.labels?.some((l) => l.name === NO_CHANGELOG_LABEL)) continue;
    if (/^Release v\d+\.\d+\.\d+$/.test(pr.title ?? "")) continue;
    const login = pr.author?.login ?? "";
    if (/^(app\/)?dependabot(\[bot\])?$/.test(login)) dependabot.push(pr.number);
    else missing.push(pr);
  }
  return { dependabot, missing };
}

/**
 * Turn [Unreleased] into `## [version] - date`, put a fresh empty [Unreleased] above it, and rewrite the link
 * references at the bottom. The previous release is the newest dated section already in the file.
 * @param {string} text
 * @param {string} version
 * @param {string} date YYYY-MM-DD
 */
export function prepareChangelog(text, version, date) {
  parseVersion(version);
  const { cl, r } = unreleased(text);
  const previous = cl.releases.find((x) => x !== r && /^\d+\.\d+\.\d+$/.test(x.name));
  const lines = [...cl.lines];

  const unreleasedRef = `[Unreleased]: ${REPO_URL}/compare/v${version}...HEAD`;
  const versionRef = previous
    ? `[${version}]: ${REPO_URL}/compare/v${previous.name}...v${version}`
    : `[${version}]: ${REPO_URL}/releases/tag/v${version}`;
  const refAt = lines.findIndex((l, i) => i >= cl.linksStart && l.startsWith("[Unreleased]:"));
  if (refAt >= 0) {
    lines.splice(refAt, 1, unreleasedRef, versionRef);
  } else if (cl.linksStart < lines.length) {
    lines.splice(cl.linksStart, 0, unreleasedRef, versionRef);
  } else {
    while (lines.length && lines.at(-1)?.trim() === "") lines.pop();
    lines.push("", unreleasedRef, versionRef, "");
  }

  lines.splice(r.index, 1, "## [Unreleased]", "", `## [${version}] - ${date}`);
  return lines.join("\n");
}

/**
 * Problems with the APK Gradle built, from its output-metadata.json, compared with package.json.
 * @param {{ elements?: { versionName?: string, versionCode?: number }[] } | null} metadata
 * @param {string} version
 */
export function verifyApkVersion(metadata, version) {
  const el = metadata?.elements?.[0];
  if (!el) return ["output-metadata.json has no elements"];
  const errors = [];
  if (el.versionName !== version) errors.push(`APK versionName is ${el.versionName}, package.json says ${version}`);
  if (el.versionCode !== versionCode(version)) errors.push(`APK versionCode is ${el.versionCode}, expected ${versionCode(version)} for ${version}`);
  return errors;
}

/**
 * @param {{ version: string, url: string, files: { name: string, bytes: number, sha256: string }[] }} input
 */
export function renderReleaseSummary({ version, url, files }) {
  return [
    `# Release v${version}`,
    "",
    "| | |",
    "|---|---|",
    `| Version | ${version} (versionCode ${versionCode(version)}) |`,
    `| Tag | \`v${version}\` |`,
    `| Release | ${url} |`,
    "",
    "| Package | Size | SHA-256 |",
    "|---|---|---|",
    ...files.map((f) => `| \`${f.name}\` | ${(f.bytes / 1024 / 1024).toFixed(2)} MB | \`${f.sha256}\` |`),
    "",
  ].join("\n");
}

/** @param {string} cmd @param {string[]} args */
function run(cmd, args) {
  return execFileSync(cmd, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** @param {string} kind */
function prepare(kind) {
  const changelogPath = join(root, "CHANGELOG.md");
  if (run("git", ["status", "--porcelain"])) {
    console.error("The working tree has uncommitted changes. Commit or stash them first.");
    return 1;
  }
  let text = readFileSync(changelogPath, "utf8");
  if (unreleasedIsEmpty(text)) {
    console.error("[Unreleased] in CHANGELOG.md is empty: nothing to release.");
    return 1;
  }

  /** @type {string | null} */
  let lastTag;
  try {
    lastTag = run("git", ["describe", "--tags", "--abbrev=0", "--match", "v[0-9]*"]);
  } catch {
    lastTag = null; // first release
  }
  const since = lastTag ? Date.parse(run("git", ["log", "-1", "--format=%cI", lastTag])) : 0;
  /** @type {(MergedPr & { mergedAt: string })[]} */
  const merged = JSON.parse(
    run("gh", ["pr", "list", "--state", "merged", "--base", "main", "--limit", "1000", "--json", "number,title,author,labels,mergedAt"]),
  );
  const { dependabot, missing } = findMissing(
    text,
    merged.filter((pr) => Date.parse(pr.mergedAt) > since),
  );
  if (missing.length) {
    console.error(
      [
        `These PRs merged since ${lastTag ?? "the start"} have no CHANGELOG line and no \`${NO_CHANGELOG_LABEL}\` label:`,
        ...missing.map((pr) => `  #${pr.number} ${pr.title ?? ""}`),
        "",
        `Add their lines under [Unreleased] (rules in CLAUDE.md) or label them \`${NO_CHANGELOG_LABEL}\`, then run this again.`,
      ].join("\n"),
    );
    return 1;
  }

  const current = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
  const version = bumpVersion(current, kind);
  versionCode(version); // throws if minor or patch reached 100
  // Everything that can fail runs before the first file is written, so a failure leaves the tree clean.
  const date = new Date().toISOString().slice(0, 10);
  text = prepareChangelog(foldDependabot(text, dependabot), version, date);
  run("npm", ["version", version, "--no-git-tag-version"]); // package.json and package-lock.json
  writeFileSync(changelogPath, text);

  console.log(
    [
      `Prepared v${version} (was ${current}).`,
      dependabot.length ? `Folded Dependabot PRs ${dependabot.map((n) => `#${n}`).join(", ")} into one "Update dependencies" line.` : "",
      "",
      "Next:",
      "  1. Check the diff: package.json, package-lock.json, CHANGELOG.md.",
      `  2. git switch -c release-v${version} && git commit -am "Release v${version}"`,
      `  3. Push and open a PR titled "Release v${version}". When it merges, the release workflow tags`,
      `     v${version} and publishes the GitHub Release.`,
    ]
      .filter((l, i) => l !== "" || i !== 1)
      .join("\n"),
  );
  return 0;
}

/** @param {string[]} argv */
function main(argv) {
  const [mode, ...rest] = argv;
  if (mode === "patch" || mode === "minor" || mode === "major") return prepare(mode);
  if (mode === "--verify-apk" && rest[0]) {
    const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
    const errors = verifyApkVersion(JSON.parse(readFileSync(rest[0], "utf8")), version);
    if (errors.length) {
      console.error(errors.join("\n"));
      return 1;
    }
    console.log(`APK version ${version} (versionCode ${versionCode(version)}) matches package.json.`);
    return 0;
  }
  if (mode === "--summary" && rest.length === 3) {
    const [dir, version, url] = rest;
    const files = readdirSync(dir)
      .sort()
      .map((name) => {
        const bytes = readFileSync(join(dir, name));
        return { name, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
      });
    process.stdout.write(renderReleaseSummary({ version, url, files }));
    return 0;
  }
  console.error(
    "usage: npm run release:prepare -- <patch|minor|major>\n" +
      "       node scripts/release.mjs --verify-apk <output-metadata.json>\n" +
      "       node scripts/release.mjs --summary <dir> <version> <release url>",
  );
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}
