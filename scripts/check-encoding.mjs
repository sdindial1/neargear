#!/usr/bin/env node
/**
 * Guard against UTF-8 text being read as CP1252 and written back — the
 * corruption that turns "—" into "â€”", "·" into "Â·", and destroys emoji.
 *
 * WHY THIS EXISTS AS A MECHANICAL CHECK
 * Mojibake is valid UTF-8. It is just the wrong characters. Typecheck passes,
 * eslint passes, `next build` passes, and it ships. This has reached NearGear
 * production twice (POST-LAUNCH.md, then commit 98aee21f, which corrupted the
 * buyer request flow and listing og:description metadata). No existing check in
 * this repo can catch it, which is the entire reason for this file.
 *
 * ROOT CAUSE, so it is not rediscovered: Windows PowerShell 5.1 `Get-Content`
 * without -Encoding decodes using the system ANSI code page (CP1252), not
 * UTF-8, and `Set-Content`/`Out-File` writes back with a BOM. Any
 * Get-Content -> modify -> Set-Content round trip over a file containing
 * non-ASCII characters corrupts it silently. Do not edit file content with
 * PowerShell; use an editor tool, or Node with explicit encodings.
 *
 * USAGE
 *   node scripts/check-encoding.mjs           # scan, exit 1 on findings
 *   node scripts/check-encoding.mjs --fix     # repair in place
 *   SKIP_ENCODING_CHECK=1 ...                 # escape hatch (see below)
 *
 * A file containing the marker below is exempt from the mojibake scan (the BOM
 * check still applies). Needed for files that discuss the corruption on
 * purpose — this one documents it with literal examples, and without the marker
 * it would flag itself and permanently break the build. Use it sparingly; a
 * corrupted file will happily claim to be documentation.
 *
 *   encoding-check-allow-literals
 *
 * Runs as a pre-commit hook (.githooks/pre-commit) and as part of `npm run
 * build`, so a bypassed hook still fails the Vercel deploy.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIX = process.argv.includes("--fix");

if (process.env.SKIP_ENCODING_CHECK === "1") {
  console.log("check-encoding: skipped via SKIP_ENCODING_CHECK=1");
  process.exit(0);
}

const SKIP_DIRS = new Set([
  "node_modules", ".next", ".git", ".vercel", "_recon", "dist", "build", "coverage",
]);
const EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|css|scss|md|sql|json|html|txt|yml|yaml)$/i;

/**
 * CP1252 0x80-0x9F. This range is where CP1252 differs from Latin-1, and is
 * exactly why quotes, dashes and ellipses are the characters that break: a
 * naive latin1 round trip cannot represent them.
 */
const CP1252_HIGH = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
};

/** The CP1252 byte a character came from, or null if it has none. */
function cp1252Byte(ch) {
  const cp = ch.codePointAt(0);
  if (cp > 0xffff) return null;
  if (cp <= 0xff) return cp;
  const m = CP1252_HIGH[cp];
  return m === undefined ? null : m;
}

const strict = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
function decodeStrict(buf) {
  try { return strict.decode(buf); } catch { return null; }
}

/** Bytes needed to complete a UTF-8 sequence starting with this lead byte. */
function seqLen(b) {
  if (b >= 0xc2 && b <= 0xdf) return 2;
  if (b >= 0xe0 && b <= 0xef) return 3;
  if (b >= 0xf0 && b <= 0xf4) return 4;
  return 0;
}

/**
 * Scan for mojibake runs. Returns { text, findings }.
 *
 * A run is only reported (and only repaired) when its CP1252 bytes decode to
 * VALID UTF-8. That test is what keeps this from mangling healthy text: a
 * character that survived the original corruption intact will not decode, so it
 * is left alone. listings/[id]/request/page.tsx is the real case — it holds a
 * healthy em dash next to corrupted ones, and a blind whole-file conversion
 * would have destroyed the healthy one.
 */
function scan(text) {
  const findings = [];
  let out = "";
  let line = 1, col = 1;

  for (let i = 0; i < text.length; ) {
    const ch = text[i];
    const lead = cp1252Byte(ch);
    const need = lead === null ? 0 : seqLen(lead);

    if (need > 0) {
      const bytes = [lead];
      let ok = true;
      for (let k = 1; k < need; k++) {
        const b = i + k < text.length ? cp1252Byte(text[i + k]) : null;
        if (b === null || b < 0x80 || b > 0xbf) { ok = false; break; }
        bytes.push(b);
      }
      if (ok) {
        const decoded = decodeStrict(Buffer.from(bytes));
        if (decoded !== null) {
          findings.push({
            line, col,
            got: text.slice(i, i + need),
            expected: decoded,
          });
          out += decoded;
          i += need;
          col += need;
          continue;
        }
      }
    }

    if (ch === "\n") { line++; col = 1; } else { col++; }
    out += ch;
    i++;
  }
  return { text: out, findings };
}

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), acc);
    } else if (EXTENSIONS.test(entry.name)) {
      acc.push(path.join(dir, entry.name));
    }
  }
  return acc;
}

const files = walk(REPO);
let badFiles = 0, totalFindings = 0, bomCount = 0, repaired = 0;

for (const abs of files) {
  const rel = path.relative(REPO, abs).replace(/\\/g, "/");
  let raw;
  try { raw = fs.readFileSync(abs); } catch { continue; }

  const hasBom = raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf;
  const body = hasBom ? raw.subarray(3) : raw;
  const text = decodeStrict(body);
  if (text === null) continue; // binary or non-UTF-8; not this check's business

  // Split so this line does not itself count as the marker.
  const MARKER = "encoding-check-" + "allow-literals";
  const exempt = text.includes(MARKER);

  const { text: fixedText, findings: found } = scan(text);
  const findings = exempt ? [] : found;
  if (!findings.length && !hasBom) continue;

  badFiles++;
  totalFindings += findings.length;
  if (hasBom) bomCount++;

  if (FIX) {
    // An exempt file only gets its BOM stripped — repairing it would rewrite
    // the literal examples it exists to document.
    fs.writeFileSync(abs, Buffer.from(exempt ? text : fixedText, "utf8")); // explicit UTF-8, no BOM
    repaired++;
    console.log(`fixed  ${rel}${hasBom ? "  [BOM removed]" : ""}  ${findings.length} sequence(s)`);
  } else {
    console.error(`\n${rel}`);
    if (hasBom) console.error(`  BOM at start of file`);
    for (const f of findings.slice(0, 8)) {
      console.error(`  ${f.line}:${f.col}  ${JSON.stringify(f.got)} should be ${JSON.stringify(f.expected)}`);
    }
    if (findings.length > 8) console.error(`  ... and ${findings.length - 8} more`);
  }
}

if (!badFiles) {
  console.log(`check-encoding: ${files.length} files clean`);
  process.exit(0);
}

if (FIX) {
  console.log(`\ncheck-encoding: repaired ${repaired} file(s). Review the diff before committing.`);
  process.exit(0);
}

console.error(
  `\ncheck-encoding: FAILED — ${totalFindings} mojibake sequence(s) and ${bomCount} BOM(s) in ${badFiles} file(s).\n` +
  `\nThis is UTF-8 that was read as CP1252 and written back. It is valid UTF-8, so\n` +
  `typecheck and build will not catch it — that is why this check exists.\n` +
  `\nMost likely cause: a PowerShell Get-Content/Set-Content round trip over these\n` +
  `files. Do not edit file content with PowerShell.\n` +
  `\nRepair with:  node scripts/check-encoding.mjs --fix\n`,
);
process.exit(1);
