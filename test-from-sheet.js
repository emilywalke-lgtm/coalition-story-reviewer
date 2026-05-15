/**
 * test-from-sheet.js
 * ──────────────────
 * Test the full pipeline using a CSV or Excel spreadsheet instead of
 * pulling live from EveryAction. Perfect for validating scoring logic
 * and email formatting before going to production.
 *
 * Usage:
 *   node test-from-sheet.js path/to/stories.csv
 *   node test-from-sheet.js path/to/stories.xlsx
 *   node test-from-sheet.js path/to/stories.csv --send     ← sends real email
 *
 * Expected columns (flexible — script auto-detects common names):
 *   Story text:  "Story", "story_text", "submission", "text", "comment", "response"
 *   First name:  "First Name", "first_name", "fname"
 *   Last name:   "Last Name",  "last_name",  "lname"
 *   State:       "State", "state", "province"
 *   ID:          "ID", "id", "vanid", "van_id"
 *
 * The script is forgiving — only the story text column is required.
 */

require('dotenv').config();

const fs   = require('fs');
const path = require('path');

const { reviewStories } = require('./src/reviewer');
const { sendDigest }    = require('./src/emailDigest');

// ── Column name detection ─────────────────────────────────────────────────────

const COLUMN_ALIASES = {
  storyText:  ['story', 'story_text', 'storytext', 'submission', 'text', 'response', 'comment', 'tell us your story', 'my story', 'your story'],
  firstName:  ['first name', 'first_name', 'firstname', 'fname', 'given name'],
  lastName:   ['last name',  'last_name',  'lastname',  'lname', 'surname', 'family name'],
  state:      ['state', 'state/province', 'stateprovince', 'province', 'region'],
  id:         ['id', 'vanid', 'van_id', 'submission_id', 'contact_id', 'record_id'],
};

function findColumn(headers, aliases) {
  const lower = headers.map(h => h.toLowerCase().trim());
  for (const alias of aliases) {
    const idx = lower.indexOf(alias);
    if (idx !== -1) return headers[idx];
  }
  // Partial match fallback
  for (const alias of aliases) {
    const idx = lower.findIndex(h => h.includes(alias));
    if (idx !== -1) return headers[idx];
  }
  return null;
}

// ── Readers ───────────────────────────────────────────────────────────────────

function readCsv(filePath) {
  // Minimal CSV parser — handles quoted fields and commas inside quotes
  const content = fs.readFileSync(filePath, 'utf8');
  const lines   = content.split(/\r?\n/);

  function parseLine(line) {
    const fields = [];
    let cur = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        fields.push(cur); cur = '';
      } else {
        cur += ch;
      }
    }
    fields.push(cur);
    return fields;
  }

  const headers = parseLine(lines[0]);
  const rows    = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = parseLine(lines[i]);
    const row  = {};
    headers.forEach((h, j) => { row[h] = (vals[j] || '').trim(); });
    rows.push(row);
  }

  return { headers, rows };
}

function readXlsx(filePath) {
  // Requires the xlsx package (already in package.json dependencies)
  let XLSX;
  try {
    XLSX = require('xlsx');
  } catch {
    console.error('❌  xlsx package not installed. Run: npm install xlsx');
    process.exit(1);
  }

  const workbook  = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet     = workbook.Sheets[sheetName];
  const rows      = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const headers   = rows.length ? Object.keys(rows[0]) : [];
  return { headers, rows };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args     = process.argv.slice(2);
  const filePath = args.find(a => !a.startsWith('--'));
  const sendReal = args.includes('--send');
  const dryRun   = !sendReal;

  if (!filePath) {
    console.error('Usage: node test-from-sheet.js path/to/stories.csv [--send]');
    console.error('       node test-from-sheet.js path/to/stories.xlsx [--send]');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`❌  File not found: ${filePath}`);
    process.exit(1);
  }

  const ext = path.extname(filePath).toLowerCase();

  console.log('\n────────────────────────────────────────────────────────');
  console.log('  Coalition Story Review — Sheet Test Mode');
  console.log(`  File:    ${path.basename(filePath)}`);
  console.log(`  Mode:    ${dryRun ? 'DRY RUN (no email sent)' : 'LIVE (will send email)'}`);
  console.log('────────────────────────────────────────────────────────\n');

  // ── 1. Read spreadsheet ────────────────────────────────────────────────────

  console.log('Step 1: Reading spreadsheet...');
  const { headers, rows } = ext === '.xlsx' || ext === '.xls'
    ? readXlsx(filePath)
    : readCsv(filePath);

  console.log(`  Columns detected: ${headers.join(', ')}`);

  // ── 2. Map columns ─────────────────────────────────────────────────────────

  const colStory = findColumn(headers, COLUMN_ALIASES.storyText);
  const colFirst = findColumn(headers, COLUMN_ALIASES.firstName);
  const colLast  = findColumn(headers, COLUMN_ALIASES.lastName);
  const colState = findColumn(headers, COLUMN_ALIASES.state);
  const colId    = findColumn(headers, COLUMN_ALIASES.id);

  if (!colStory) {
    console.error('\n❌  Could not find a story text column.');
    console.error(`    Available columns: ${headers.join(', ')}`);
    console.error(`    Expected one of: ${COLUMN_ALIASES.storyText.join(', ')}`);
    process.exit(1);
  }

  console.log(`  Story column:     "${colStory}"`);
  if (colFirst) console.log(`  First name:       "${colFirst}"`);
  if (colLast)  console.log(`  Last name:        "${colLast}"`);
  if (colState) console.log(`  State:            "${colState}"`);
  if (colId)    console.log(`  ID column:        "${colId}"`);

  // ── 3. Build story objects ─────────────────────────────────────────────────

  const stories = rows
    .map((row, i) => ({
      vanId:           colId    ? (row[colId] || `row-${i + 2}`) : `row-${i + 2}`,
      firstName:       colFirst ? (row[colFirst] || '') : '',
      lastName:        colLast  ? (row[colLast]  || '') : '',
      stateOrProvince: colState ? (row[colState] || '') : '',
      storyText:       (row[colStory] || '').trim(),
      submittedAt:     new Date().toISOString(),
    }))
    .filter(s => s.storyText.length >= 20);   // drop empties

  console.log(`  ${stories.length} stories with text found (${rows.length - stories.length} empty rows skipped).\n`);

  if (stories.length === 0) {
    console.log('No stories to review. Check your column mapping above.\n');
    process.exit(0);
  }

  // ── 4. Score with Claude ───────────────────────────────────────────────────

  console.log('Step 2: Scoring stories with Claude...');

  const minScore = parseInt(process.env.MIN_SCORE_THRESHOLD || '4');

  const scored = await reviewStories(stories, {
    apiKey:         process.env.ANTHROPIC_API_KEY || (() => { throw new Error('ANTHROPIC_API_KEY not set'); })(),
    exampleStories: process.env.EXAMPLE_APPROVED_STORIES || '',
    concurrency:    3,
  });

  const digestWorthy = scored.filter(
    ({ result }) => result.recommendation !== 'skip' && result.recommendation !== 'error' && (result.score || 0) >= minScore
  );

  console.log(`\n  ${digestWorthy.length} of ${scored.length} stories meet the threshold (score ≥ ${minScore}).\n`);

  if (digestWorthy.length === 0) {
    console.log('No stories met the threshold. Adjust MIN_SCORE_THRESHOLD if needed.\n');
    // Still print the full scored list for debugging
    console.log('All scores:');
    scored.forEach(({ story, result }) => {
      const who = [story.firstName, story.lastName].filter(Boolean).join(' ') || story.vanId;
      console.log(`  [${result.score}/10] ${result.recommendation.padEnd(15)} ${who} — "${story.storyText.slice(0, 60)}..."`);
    });
    return;
  }

  // ── 5. Send (or dry-run) email ─────────────────────────────────────────────

  console.log(`Step 3: ${dryRun ? 'Building digest preview (dry run)' : 'Sending digest email'}...`);

  const toEmails = (process.env.TO_EMAILS || '').split(',').filter(Boolean);
  if (!dryRun && toEmails.length === 0) {
    console.error('❌  TO_EMAILS not set in .env');
    process.exit(1);
  }

  await sendDigest(digestWorthy, {
    apiKey:   dryRun ? 'dry-run' : process.env.SENDGRID_API_KEY,
    from:     process.env.FROM_EMAIL    || 'test@example.com',
    fromName: process.env.FROM_NAME     || 'Coalition Story Review',
    to:       toEmails.length ? toEmails : ['preview@example.com'],
    dryRun,
  });

  // ── 6. Summary table ───────────────────────────────────────────────────────

  console.log('\n── Full scoring breakdown ──────────────────────────────────');
  console.log(`${'Score'.padEnd(7)} ${'Rec'.padEnd(16)} ${'Submitter'.padEnd(22)} Headline`);
  console.log('-'.repeat(80));
  for (const { story, result } of scored) {
    const who  = [story.firstName, story.lastName].filter(Boolean).join(' ') || story.vanId;
    const rec  = (result.recommendation || 'error').padEnd(16);
    const who2 = who.slice(0, 20).padEnd(22);
    const hl   = (result.headline || '').slice(0, 35);
    console.log(`${String(result.score || 0).padEnd(7)} ${rec} ${who2} ${hl}`);
  }
  console.log('────────────────────────────────────────────────────────────\n');
}

main().catch(err => {
  console.error('\n❌  Test failed:', err.message);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
