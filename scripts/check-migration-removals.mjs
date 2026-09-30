#!/usr/bin/env node
/**
 * Removal guard for Supabase migrations. Run BEFORE applying any migration.
 *
 *   npm run check:migrations -- 037_giveaway_event_reason.sql [more.sql ...]
 *   npm run check:migrations -- 037_x.sql --removal-reviewed=037_x.sql
 *
 * Rule (AGENTS.md → "Migration order"): a migration that REMOVES or RENAMES
 * anything ships WITH or AFTER the code that stops using it — never before.
 * 037 dropped giveaway_events columns while the deployed route still wrote
 * them; every insert 500'd and the /giveaway funnel recorded nothing for 20
 * days of paid traffic, with no alert.
 *
 * For every DROP COLUMN / RENAME COLUMN / DROP TABLE|VIEW|FUNCTION / table
 * RENAME in the given files, this searches origin/main's src/ — what is
 * DEPLOYED, not the working tree — for the name. Any hit exits 1 until that
 * file is acknowledged with --removal-reviewed=<file>, which you pass only
 * after confirming the code that stops using the name is LIVE.
 *
 * Name matching is coarse (utm_source also lives on page_views), so it
 * over-reports on purpose: a false alarm costs a minute, a miss cost 20 days.
 *
 * No database access — git only — so it is safe to run anywhere. Deliberately
 * NOT a pre-commit hook: a removal migration is normally committed alongside
 * the code that stops using the name, before that code is on origin/main, so a
 * commit-time check would block every correct change. Apply time is the gate.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = path.join(REPO, "supabase", "migrations");

export function removedNames(sql) {
  const s = sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const id = `"?([A-Za-z_][\\w]*)"?`;
  const out = [];
  for (const [re, kind] of [
    [new RegExp(`DROP\\s+COLUMN\\s+(?:IF\\s+EXISTS\\s+)?${id}`, "gi"), "drop column"],
    [new RegExp(`RENAME\\s+COLUMN\\s+${id}\\s+TO`, "gi"), "rename column"],
    [new RegExp(`DROP\\s+(?:TABLE|VIEW|FUNCTION)\\s+(?:IF\\s+EXISTS\\s+)?(?:public\\.)?${id}`, "gi"), "drop table/view/function"],
    [new RegExp(`ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?(?:public\\.)?${id}\\s+RENAME\\s+TO`, "gi"), "rename table"],
  ]) {
    for (const m of s.matchAll(re)) out.push({ name: m[1], kind });
  }
  return out;
}

function deployedReferences(name) {
  try {
    const hits = execFileSync(
      "git",
      ["grep", "-n", "-w", "-I", name, "origin/main", "--", "src"],
      { cwd: REPO, encoding: "utf8" },
    );
    return hits.trim().split("\n").filter(Boolean);
  } catch (e) {
    if (e.status === 1) return []; // git grep: no matches
    throw e;
  }
}

/**
 * Returns true when every file is safe to apply. Prints its reasoning.
 * `files` are basenames inside supabase/migrations.
 */
export function checkMigrationRemovals(files, { reviewed = new Set(), log = console.log } = {}) {
  try {
    execFileSync("git", ["fetch", "-q", "origin", "main"], { cwd: REPO });
  } catch {
    log("REMOVAL GUARD: could not fetch origin/main — refusing to judge against a stale copy.");
    return false;
  }
  let ok = true;
  log("removal guard (against deployed origin/main):");
  for (const name of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, name), "utf8");
    const removals = removedNames(sql);
    if (!removals.length) {
      log(`  ${name}: additive — no removals`);
      continue;
    }
    for (const r of removals) {
      const refs = deployedReferences(r.name);
      log(`  ${name}: ${r.kind} ${r.name} — ${refs.length} reference(s) in deployed src/`);
      for (const h of refs.slice(0, 6)) log(`      ${h.replace(/^origin\/main:/, "")}`);
      if (refs.length > 6) log(`      … ${refs.length - 6} more`);
      if (refs.length && !reviewed.has(name)) ok = false;
    }
  }
  if (!ok) {
    log(
      "\nBLOCKED: deployed code still names something these migrations remove.\n" +
        "Ship the code that stops using it first (or in the same release), confirm\n" +
        "it is LIVE, then re-run with --removal-reviewed=<file> for each file.",
    );
  }
  return ok;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const files = args.filter((a) => !a.startsWith("--")).map((f) => path.basename(f));
  const reviewed = new Set(
    args.filter((a) => a.startsWith("--removal-reviewed=")).map((a) => path.basename(a.slice(19))),
  );
  if (!files.length) {
    console.error("usage: npm run check:migrations -- <file.sql> [...] [--removal-reviewed=<file.sql>]");
    process.exit(2);
  }
  process.exit(checkMigrationRemovals(files, { reviewed }) ? 0 : 1);
}
