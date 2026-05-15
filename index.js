/**
 * Coalition Story Review Pipeline
 * ────────────────────────────────
 * 1. Pull new submissions from EveryAction
 * 2. Score with Claude
 * 3. Generate the interactive dashboard (docs/index.html)
 * 4. Send the email digest with a link to the dashboard
 *
 * Run:   node index.js
 * Dry:   DRY_RUN=true node index.js
 * Cron:  GitHub Actions (.github/workflows/weekly-review.yml)
 */

require('dotenv').config();

const { fetchRecentStories } = require('./src/everyaction');
const { reviewStories }      = require('./src/reviewer');
const { writeDashboard }     = require('./src/dashboard');
const { sendDigest }         = require('./src/emailDigest');

function requireEnv(key) {
  const val = process.env[key];
  if (!val) {
    console.error(`❌  Missing required env var: ${key}`);
    console.error(`    Copy .env.example to .env and fill in all values.`);
    process.exit(1);
  }
  return val;
}

async function main() {
  const startTime = Date.now();
  const dryRun    = process.env.DRY_RUN === 'true' || process.argv.includes('--dry-run');

  // Dashboard URL — where GitHub Pages will serve the file
  // Format: https://YOUR-ORG.github.io/coalition-story-reviewer/
  const dashboardBaseUrl = process.env.DASHBOARD_URL || 'https://your-org.github.io/coalition-story-reviewer/';

  console.log('\n────────────────────────────────────────────────────────');
  console.log('  Coalition Story Review Pipeline');
  console.log(`  ${new Date().toISOString()}${dryRun ? ' [DRY RUN]' : ''}`);
  console.log('────────────────────────────────────────────────────────\n');

  // ── 1. Fetch from EveryAction ────────────────────────────────────────────

  console.log('Step 1: Fetching submissions from EveryAction...');
  const lookbackHours = parseInt(process.env.LOOKBACK_HOURS || '168'); // default: 1 week

  const stories = await fetchRecentStories({
    appName:         requireEnv('EVERYACTION_APP_NAME'),
    apiKey:          requireEnv('EVERYACTION_API_KEY'),
    dbMode:          parseInt(process.env.EVERYACTION_DB_MODE || '1'),
    storyQuestionId: parseInt(requireEnv('EVERYACTION_STORY_QUESTION_ID')),
    activistCodeId:  parseInt(requireEnv('EVERYACTION_FORM_ACTIVIST_CODE_ID')),
    lookbackHours,
  });

  if (stories.length === 0) {
    console.log(`\n✓ No new submissions in the last ${lookbackHours} hours. Done.\n`);
    return;
  }

  console.log(`  ✓ ${stories.length} submissions found.\n`);

  // ── 2. Score with Claude ─────────────────────────────────────────────────

  console.log('Step 2: Scoring with Claude...');
  const scored = await reviewStories(stories, {
    apiKey:         requireEnv('ANTHROPIC_API_KEY'),
    exampleStories: process.env.EXAMPLE_APPROVED_STORIES || '',
    concurrency:    3,
  });

  const minScore = parseInt(process.env.MIN_SCORE_THRESHOLD || '4');
  const digestWorthy = scored.filter(
    ({ result }) => result.recommendation !== 'skip' &&
                    result.recommendation !== 'error' &&
                    (result.score || 0) >= minScore
  );

  console.log(`\n  ${digestWorthy.length} of ${scored.length} stories meet the threshold.\n`);

  // ── 3. Generate dashboard ─────────────────────────────────────────────────
  // Write ALL scored stories to the dashboard (including skips — reviewers
  // can filter to see everything). The email only surfaces the good ones.

  console.log('Step 3: Building dashboard...');
  const { weekSlug } = writeDashboard(scored, { outputDir: 'docs' });

  const dashboardUrl      = dashboardBaseUrl;
  const archiveUrl        = `${dashboardBaseUrl}digest-${weekSlug}.html`;

  // ── 4. Send digest email ──────────────────────────────────────────────────

  console.log('\nStep 4: Sending digest email...');

  if (digestWorthy.length === 0) {
    console.log('  No stories met the threshold — digest not sent.');
  } else {
    await sendDigest(digestWorthy, {
      apiKey:      dryRun ? 'dry-run' : requireEnv('SENDGRID_API_KEY'),
      from:        requireEnv('FROM_EMAIL'),
      fromName:    process.env.FROM_NAME || 'Coalition Story Review',
      to:          requireEnv('TO_EMAILS').split(','),
      dashboardUrl,
      dryRun,
    });
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✓ Pipeline complete in ${elapsed}s.\n`);
  console.log(`  Dashboard: ${dashboardUrl}`);
  console.log(`  Archive:   ${archiveUrl}\n`);
}

main().catch(err => {
  console.error('\n❌  Pipeline failed:', err.message);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
