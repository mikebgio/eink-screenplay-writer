#!/usr/bin/env node
// CI run summary. Prints Markdown to stdout; the workflow appends it to $GITHUB_STEP_SUMMARY.
//
//   node scripts/ci-summary.mjs
//
// No dependencies. Works when earlier steps failed: whatever is missing is shown as "not run".
// Inputs (all optional):
//   OUTCOME_<CHECK>  a step outcome (success | failure | cancelled | skipped), one per check below
//   VITEST_JSON      Vitest JSON report      (default reports/vitest.json)
//   ESLINT_JSON      ESLint JSON report      (default reports/eslint.json)
//   APK_PATH         the built APK           (default android/app/build/outputs/apk/debug/app-debug.apk)
//
// To add a check: add it to CHECKS below, give its workflow step an id, and pass
// OUTCOME_<ID> to the summary step (see .github/workflows/main.yml).

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, dirname, basename, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The checks shown in the Result table, in order. `env` is the OUTCOME_ variable that carries the step outcome. */
export const CHECKS = [
  { key: "typecheck", label: "Typecheck", env: "OUTCOME_TYPECHECK" },
  { key: "lint", label: "Lint", env: "OUTCOME_LINT" },
  { key: "tests", label: "Tests", env: "OUTCOME_TESTS" },
  { key: "plan", label: "Plan up to date", env: "OUTCOME_PLAN" },
  { key: "apk", label: "APK", env: "OUTCOME_APK" },
];

const NOT_RUN = "not run";

/** @param {string | undefined} outcome */
export function outcomeCell(outcome) {
  if (outcome === "success") return "✅";
  if (outcome === "failure") return "❌";
  // skipped (an earlier step failed), cancelled, or the step never existed
  return NOT_RUN;
}

/**
 * @typedef {{ status?: string, fullName?: string, title?: string, ancestorTitles?: string[] }} VitestAssertion
 * @typedef {{ name?: string, startTime?: number, endTime?: number, assertionResults?: VitestAssertion[] }} VitestFile
 * @typedef {{ numPassedTests?: number, numFailedTests?: number, numPendingTests?: number, numTodoTests?: number,
 *             numTotalTests?: number, startTime?: number, testResults?: VitestFile[] }} VitestReport
 * @typedef {{ ruleId?: string | null, severity?: number, line?: number, message?: string }} EslintMessage
 * @typedef {{ filePath: string, messages?: EslintMessage[], errorCount?: number, warningCount?: number }} EslintFile
 * @typedef {{ name: string, bytes: number, sha256: string, versionName?: string, versionCode?: number | string }} ApkInfo
 * @typedef {{ file: string, progress: string | null }} PlanProgress
 * @typedef {{
 *   outcomes?: Record<string, string | undefined>,
 *   vitest?: VitestReport | null,
 *   eslint?: EslintFile[] | null,
 *   apk?: ApkInfo | null,
 *   plans?: PlanProgress[] | null,
 *   next?: string | null,
 *   root?: string,
 * }} SummaryInput
 */

/** @param {SummaryInput} input */
export function renderResult(input) {
  const outcomes = input.outcomes ?? {};
  const lines = ["## Result", "", "| Check | Result |", "|---|---|"];
  for (const c of CHECKS) {
    // Optional checks (the PR-only CHANGELOG check) are left out entirely when the step didn't exist.
    if (c.optional && !outcomes[c.key]) continue;
    lines.push(`| ${c.label} | ${outcomeCell(outcomes[c.key])} |`);
  }
  return lines.join("\n");
}

/** @param {VitestReport | null | undefined} report */
export function renderTests(report) {
  const lines = ["## Tests", ""];
  if (!report) return [...lines, NOT_RUN].join("\n");
  const files = report.testResults ?? [];
  const passed = report.numPassedTests ?? 0;
  const failed = report.numFailedTests ?? 0;
  const skipped = (report.numPendingTests ?? 0) + (report.numTodoTests ?? 0);
  const ends = files.map((f) => f.endTime ?? 0);
  const start = report.startTime ?? Math.min(...files.map((f) => f.startTime ?? Infinity));
  const duration = ends.length && Number.isFinite(start) ? Math.max(...ends) - start : null;
  lines.push(
    `**${files.length}** files · **${passed}** passed · **${failed}** failed · **${skipped}** skipped` +
      (duration != null && duration >= 0 ? ` · ${(duration / 1000).toFixed(1)} s` : ""),
  );
  const failures = [];
  for (const f of files) {
    for (const a of f.assertionResults ?? []) {
      if (a.status !== "failed") continue;
      const name = a.fullName || [...(a.ancestorTitles ?? []), a.title].filter(Boolean).join(" › ");
      failures.push(`- \`${shortPath(f.name ?? "", undefined)}\` ${name}`);
    }
  }
  if (failures.length) lines.push("", "Failed tests:", "", ...failures);
  return lines.join("\n");
}

/**
 * @param {EslintFile[] | null | undefined} files
 * @param {string} [base] directory to show file paths relative to
 */
export function renderLint(files, base) {
  const lines = ["## Lint", ""];
  if (!files) return [...lines, NOT_RUN].join("\n");
  let errors = 0;
  let warnings = 0;
  const problems = [];
  for (const f of files) {
    errors += f.errorCount ?? 0;
    warnings += f.warningCount ?? 0;
    for (const m of f.messages ?? []) {
      problems.push(`- \`${shortPath(f.filePath, base)}:${m.line ?? "?"}\` ${m.ruleId ?? "(parse error)"}`);
    }
  }
  lines.push(`**${errors}** errors · **${warnings}** warnings`);
  if (problems.length) {
    lines.push("", ...problems.slice(0, 10));
    if (problems.length > 10) lines.push(`- … and ${problems.length - 10} more`);
  }
  return lines.join("\n");
}

/** @param {ApkInfo | null | undefined} apk */
export function renderPackage(apk) {
  const lines = ["## Package", ""];
  if (!apk) return [...lines, NOT_RUN].join("\n");
  lines.push(
    "| | |",
    "|---|---|",
    `| File | \`${apk.name}\` |`,
    `| Size | ${(apk.bytes / 1024 / 1024).toFixed(2)} MB |`,
    `| SHA-256 | \`${apk.sha256}\` |`,
    `| versionName | ${apk.versionName ?? "unknown"}${apk.versionCode != null ? ` (versionCode ${apk.versionCode})` : ""} |`,
  );
  return lines.join("\n");
}

/**
 * @param {PlanProgress[] | null | undefined} plans
 * @param {string | null | undefined} next
 */
export function renderPlan(plans, next) {
  const lines = ["## Plan", ""];
  if (!plans || !plans.length) return [...lines, NOT_RUN].join("\n");
  for (const p of plans) lines.push(`- **${p.file}:** ${p.progress ?? "no progress line"}`);
  lines.push("", "`plan.mjs --next`:", "", "```", (next ?? "").trim() || NOT_RUN, "```");
  return lines.join("\n");
}

/** @param {SummaryInput} input */
export function renderSummary(input) {
  return [
    "# CI summary",
    renderResult(input),
    renderTests(input.vitest),
    renderLint(input.eslint, input.root),
    renderPackage(input.apk),
    renderPlan(input.plans, input.next),
  ].join("\n\n") + "\n";
}

/**
 * @param {string} path
 * @param {string | undefined} base
 */
function shortPath(path, base) {
  const from = base ?? root;
  return path.startsWith(from) ? relative(from, path) : path;
}

/** @param {string} path */
function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * The APK's versionName and versionCode as Gradle wrote them, from output-metadata.json next to the APK.
 * @param {string} apkPath
 */
export function readApkMetadata(apkPath) {
  const meta = readJson(join(dirname(apkPath), "output-metadata.json"));
  const el = meta?.elements?.[0];
  return el ? { versionName: el.versionName, versionCode: el.versionCode } : null;
}

/** @param {NodeJS.ProcessEnv} env */
function collect(env) {
  /** @type {Record<string, string | undefined>} */
  const outcomes = {};
  for (const c of CHECKS) outcomes[c.key] = env[c.env] || undefined;

  const apkPath = env.APK_PATH || join(root, "android/app/build/outputs/apk/debug/app-debug.apk");
  let apk = null;
  if (existsSync(apkPath)) {
    const bytes = readFileSync(apkPath);
    const meta = readApkMetadata(apkPath);
    apk = {
      name: basename(apkPath),
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      versionName: meta?.versionName ?? readJson(join(root, "package.json"))?.version,
      versionCode: meta?.versionCode,
    };
  }

  const plans = ["PLAN.md", "PLAN-2.md"]
    .filter((f) => existsSync(join(root, f)))
    .map((file) => {
      const m = readFileSync(join(root, file), "utf8").match(/^\*\*Progress:\*\*\s*(.+)$/m);
      return { file, progress: m ? m[1] : null };
    });
  let next;
  try {
    next = execFileSync(process.execPath, [join(root, "scripts/plan.mjs"), "--next"], { encoding: "utf8" });
  } catch {
    next = null;
  }

  return {
    outcomes,
    vitest: readJson(env.VITEST_JSON || join(root, "reports/vitest.json")),
    eslint: readJson(env.ESLINT_JSON || join(root, "reports/eslint.json")),
    apk,
    plans,
    next,
    root,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(renderSummary(collect(process.env)));
}
