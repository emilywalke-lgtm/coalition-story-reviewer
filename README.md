# Coalition Story Review Pipeline

Automated pipeline that pulls story submissions from EveryAction,
scores them with Claude, and sends a ranked email digest to your team.

---

## How it works

```
EveryAction (form submissions)
        ↓  every 24 hours
  Pull new stories via API
        ↓
  Score each story with Claude
  (approve / consider / flag_language / skip)
        ↓
  Send HTML email digest
  (only stories that meet threshold)
```

---

## Setup: 5 steps

### Step 1 — Clone the repo

```bash
git clone https://github.com/YOUR-ORG/coalition-story-reviewer.git
cd coalition-story-reviewer
npm install
```

### Step 2 — Find your EveryAction IDs

You need two IDs from EveryAction:

**Survey Question ID** (your "Tell us your story" field):
1. Go to Settings → Survey Questions
2. Click your story question
3. The ID is in the URL: `.../surveyQuestions/XXXXX`

**Activist Code ID** (applied when someone submits the form):
1. Go to Settings → Activist Codes
2. Find the code linked to your digital action form
3. The ID is in the URL: `.../activistCodes/XXXXX`

**API credentials:**
1. Go to Settings → Developer → API Access
2. Note your Application Name and generate an API key

### Step 3 — Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in all values. The key ones:

| Variable | Where to find it |
|---|---|
| `EVERYACTION_APP_NAME` | EveryAction → Settings → API |
| `EVERYACTION_API_KEY` | EveryAction → Settings → API |
| `EVERYACTION_STORY_QUESTION_ID` | Survey Questions URL |
| `EVERYACTION_FORM_ACTIVIST_CODE_ID` | Activist Codes URL |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `SENDGRID_API_KEY` | app.sendgrid.com → Settings → API Keys |
| `FROM_EMAIL` | Must be verified in SendGrid |
| `TO_EMAILS` | Comma-separated recipient list |

**Calibration (strongly recommended):**
Paste 2–5 of your previously approved stories into `EXAMPLE_APPROVED_STORIES`
in your `.env`. Separate them with ` --- `. This dramatically improves Claude's
accuracy by showing it your exact standards.

### Step 4 — Test locally

```bash
# Dry run: prints results to console, does not send email
DRY_RUN=true node index.js

# Full run: sends real email
node index.js
```

### Step 5 — Deploy to GitHub Actions (for automated cadence)

1. Push this repo to GitHub (can be private)
2. Add all your secrets:
   - Go to: Repository → Settings → Secrets and variables → Actions
   - Click "New repository secret" for each variable in `.env`
3. The workflow in `.github/workflows/daily-review.yml` will run
   automatically every weekday at 8am Eastern
4. To change the schedule, edit the `cron` expression in that file

---

## Adjusting the cadence

Edit `.github/workflows/daily-review.yml`:

```yaml
# Every weekday at 8am ET (current default)
- cron: '0 12 * * 1-5'

# Mon/Wed/Fri
- cron: '0 12 * * 1,3,5'

# Every day
- cron: '0 12 * * *'

# Twice daily (8am and 4pm ET)
- cron: '0 12,20 * * *'
```

---

## Adjusting the scoring bar

In `.env`:

```
# Only include stories scoring 4 or above in the digest (0–10)
MIN_SCORE_THRESHOLD=4

# Look back further (e.g., weekly digest)
LOOKBACK_HOURS=168
```

---

## EveryAction field mapping

If your stories are stored differently in EveryAction (as Notes rather than
Survey Question responses), edit `src/everyaction.js`:

1. In `fetchRecentStories()`, change the call from `getStoryText()` to
   `getStoryFromNotes()` — the method is already written, just uncommented.

2. If your form uses a different field structure, the place to adjust is
   the `getStoryText()` method — specifically the line that extracts the
   text from `storyResponse.responses`.

---

## Running a manual digest from the GitHub UI

1. Go to: Repository → Actions → "Daily Story Review"
2. Click "Run workflow"
3. Set "Dry run" to `true` to test without sending
4. Click "Run workflow"

---

## Cost estimate

At 50 submissions/day scored with Claude Sonnet:
- Claude API: ~$0.05–0.15/day
- SendGrid: free tier (100 emails/day)
- GitHub Actions: free tier (2,000 min/month)

Total: effectively free at this volume.
