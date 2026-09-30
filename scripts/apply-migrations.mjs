#!/usr/bin/env node
/**
 * Apply Supabase migrations to the LIVE database — the production write path.
 *
 *   npm run db:apply -- 038_x.sql --dry-run            (applies, then ROLLS BACK)
 *   npm run db:apply -- 038_x.sql --yes-apply-to-dev   (commits)
 *   npm run db:apply -- 037_x.sql --yes-apply-to-dev --removal-reviewed=037_x.sql
 *
 * Version-controlled so it does not exist on one machine. It used to live in
 * _recon/ (gitignored), with the file list hard-coded and edited before every
 * run; migrations 036 and 037 were applied some other way, and 037 dropped
 * columns production still wrote. That broke /giveaway tracking for 20 days.
 *
 * THE PASSWORD IS NOT HERE. DEV_DATABASE_URL is read from `.env.dev` at the
 * repo root (gitignored by the `.env*` rule), falling back to `_recon/.env.dev`
 * where it has historically lived. Nothing else is read from the environment,
 * so a stray DATABASE_URL in a shell can never redirect this.
 *
 * "dev" is a historical name: project rbqqmzdtzrxvmtxgqesd serves dev AND
 * production. There is one database and this writes to it.
 *
 * WHAT IT ENFORCES
 *   - files are named on the command line; nothing is applied by default and
 *     never a whole directory
 *   - each must be NNN_name.sql inside supabase/migrations, given in ascending
 *     order, no duplicates
 *   - the removal guard (scripts/check-migration-removals.mjs) passes BEFORE a
 *     connection is opened: nothing that drops or renames a name deployed code
 *     still uses (AGENTS.md → "Migration order")
 *   - the connection string must point at the project ref below; the inverted
 *     guard in _recon/run-migrations.mjs (scratch only) is the mirror image
 *   - --yes-apply-to-dev to commit; --dry-run to apply inside a transaction and
 *     roll it back, which proves the SQL runs against the real schema without
 *     changing it
 *   - STOPS at the first failure. Migrations are ordered; applying 039 after
 *     038 failed is how a schema ends up in a state no file describes.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { checkMigrationRemovals } from "./check-migration-removals.mjs";

const PROJECT_REF = "rbqqmzdtzrxvmtxgqesd";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = path.join(REPO, "supabase", "migrations");
const LOG_PATH = path.join(REPO, "migration-apply-log.md");

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const files = args.filter((a) => !a.startsWith("--")).map((f) => path.basename(f));
const reviewed = new Set(
  args.filter((a) => a.startsWith("--removal-reviewed=")).map((a) => path.basename(a.slice(19))),
);
const dryRun = flag("--dry-run");
const commit = flag("--yes-apply-to-dev");

const die = (msg) => {
  console.error(msg);
  process.exit(1);
};

// ---- arguments ------------------------------------------------------------
if (!files.length) {
  die(
    "usage: npm run db:apply -- <NNN_name.sql> [...] (--dry-run | --yes-apply-to-dev)\n" +
      "       [--removal-reviewed=<NNN_name.sql>]",
  );
}
if (dryRun === commit) {
  die("Pass exactly one of --dry-run (roll back) or --yes-apply-to-dev (commit).");
}
for (const f of files) {
  if (!/^\d{3}_[\w.-]+\.sql$/.test(f)) die(`Not a migration file name: ${f}`);
  if (!fs.existsSync(path.join(MIGRATIONS, f))) die(`No such file in supabase/migrations: ${f}`);
}
if (new Set(files).size !== files.length) die("A file is listed twice.");
const sorted = [...files].sort();
if (sorted.join() !== files.join()) {
  die(`Files must be given in ascending order: ${sorted.join(" ")}`);
}

const sqlOf = Object.fromEntries(
  files.map((f) => [f, fs.readFileSync(path.join(MIGRATIONS, f), "utf8")]),
);
if (dryRun) {
  // A file that commits its own transaction would commit inside a "dry run".
  for (const f of files) {
    if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im.test(sqlOf[f]) || /CONCURRENTLY/i.test(sqlOf[f])) {
      die(`${f} manages its own transaction (or uses CONCURRENTLY); it cannot be dry-run safely.`);
    }
  }
}

// ---- removal guard, before any connection ----------------------------------
console.log("");
if (!checkMigrationRemovals(files, { reviewed })) process.exit(1);

// ---- connection string: .env.dev only, never the shell ---------------------
const envCandidates = [path.join(REPO, ".env.dev"), path.join(REPO, "_recon", ".env.dev")];
const envPath = envCandidates.find((p) => fs.existsSync(p));
if (!envPath) {
  die(
    `No .env.dev found (looked in ${envCandidates.join(", ")}).\n` +
      `Create ${envCandidates[0]} — gitignored — containing:\n` +
      `  DEV_DATABASE_URL=postgresql://postgres.${PROJECT_REF}:<password>@<host>:5432/postgres`,
  );
}
const m = fs.readFileSync(envPath, "utf8").match(/^\s*DEV_DATABASE_URL\s*=\s*(.+?)\s*$/m);
if (!m) die(`DEV_DATABASE_URL not found in ${envPath}`);
const url = m[1].replace(/^["']|["']$/g, "");
if (!url.includes(PROJECT_REF)) {
  die(`REFUSING: the connection string in ${envPath} does not point at project ${PROJECT_REF}.`);
}

// ---- apply ------------------------------------------------------------------
function locateFailure(sql, position) {
  if (!position) return null;
  const idx = Number(position) - 1;
  if (Number.isNaN(idx) || idx < 0 || idx > sql.length) return null;
  const before = sql.lastIndexOf(";", idx);
  const after = sql.indexOf(";", idx);
  const statement = sql.slice(before + 1, after === -1 ? sql.length : after + 1).trim();
  return { statement, line: sql.slice(0, idx).split("\n").length };
}

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  statement_timeout: 120_000,
});
await client.connect();
const { rows: info } = await client.query("select current_database() as db");
console.log(`\nTARGET: ${info[0].db} (project ${PROJECT_REF} — serves dev AND production)`);
console.log(`MODE:   ${dryRun ? "DRY RUN — every file is rolled back" : "COMMIT"}`);
console.log(`FILES:  ${files.join(", ")}\n`);

const results = [];
for (const name of files) {
  const sql = sqlOf[name];
  try {
    if (dryRun) {
      await client.query("BEGIN");
      try {
        await client.query(sql);
      } finally {
        await client.query("ROLLBACK");
      }
    } else {
      await client.query(sql); // whole file, one implicit transaction
    }
    results.push({ name, ok: true });
    console.log(`  ${dryRun ? "OK (rolled back)" : "OK"}  ${name}`);
  } catch (err) {
    const where = locateFailure(sql, err.position);
    results.push({ name, ok: false, err, where });
    console.log(`  FAILED  ${name} — ${err.code ?? "?"} ${err.message}`);
    if (where) console.log(`          at line ~${where.line}: ${where.statement.slice(0, 200)}`);
    const rest = files.slice(files.indexOf(name) + 1);
    if (rest.length) console.log(`  STOPPED — not attempted: ${rest.join(", ")}`);
    break;
  }
}
await client.end();

const failed = results.find((r) => !r.ok);
fs.appendFileSync(
  LOG_PATH,
  [
    `## ${new Date().toISOString()} — ${dryRun ? "dry run" : "COMMIT"}`,
    ...results.map((r) =>
      r.ok
        ? `- OK — ${r.name}`
        : `- **FAILED** — ${r.name}: \`${r.err.code ?? "?"}\` ${r.err.message}` +
          (r.where ? ` (line ~${r.where.line})` : ""),
    ),
    ...files.slice(results.length).map((f) => `- not attempted — ${f}`),
    "",
    "",
  ].join("\n"),
  "utf8",
);
console.log(`\nlogged to ${path.relative(REPO, LOG_PATH)}`);
process.exit(failed ? 1 : 0);
