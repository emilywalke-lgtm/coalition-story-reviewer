/**
 * Story Reviewer
 *
 * Sends each story to Claude for scoring against the coalition's criteria.
 * Returns structured results: score, recommendation, headline, quote, tags, reasoning.
 *
 * Recommendations:
 *   approve       → Strong story, ready to use
 *   consider      → Has merit, may need editing
 *   flag_language → Good story but contains profanity/slurs — surface for review
 *   skip          → Not usable (generic, complaint, vague)
 */

const Anthropic = require('@anthropic-ai/sdk');

const BASE_SYSTEM_PROMPT = `You are a story reviewer for the Coalition to Strengthen America's Healthcare — a national advocacy coalition that protects and strengthens America's hospitals and healthcare system.

Your job is to evaluate patient and community stories submitted through digital action forms. Identify which stories are powerful enough for coalition communications, advocacy, and social media.

THE COALITION'S POSITIONING:
Hospitals are the backbone of American communities. They provide essential, life-saving care for everyone. We support policies that protect and strengthen hospitals and ensure access to quality care.

A GREAT STORY — approve, score 7–10:
- Shows the personal human impact of a hospital or healthcare provider
- Demonstrates concretely why hospitals are essential to the person, family, or community
- Is emotionally compelling and would motivate someone to support the coalition
- Is specific: real conditions, experiences, outcomes — not vague praise
- Has a memorable, quotable moment or line usable in communications
- Aligns with pro-hospital, pro-healthcare-access messaging

BORDERLINE — consider, score 4–6:
- Has emotional content but lacks specificity or a clear narrative arc
- Policy-relevant but not particularly personal
- Good elements but needs editing to be usable

SKIP — score 0–3:
- Generic one-liners ("hospitals are important, fund them")
- Complaints without narrative (venting with no arc or resolution)
- Pure policy opinions with no personal story
- Too vague or too short to use

CRITICAL LANGUAGE RULE:
If a story contains profanity or slurs, do NOT lower its quality score. Evaluate the story fully and honestly on its merits. Set recommendation to "flag_language" and has_profanity to true. Only skip for language if the story is also genuinely low quality. A powerful story with a curse word is still valuable — the team may edit it.

Return ONLY a valid JSON object. No preamble, no explanation, no markdown fences:
{
  "score": <integer 0–10>,
  "recommendation": <"approve" | "consider" | "flag_language" | "skip">,
  "tags": <array, subset of: ["emotional","policy_relevant","shareable","hospital_impact","community","personal_stakes","insurance_denial","rural_access","medicare_medicaid"]>,
  "headline": <"Max 8-word story summary">,
  "highlight_quote": <"Most quotable verbatim sentence from the story, or null">,
  "reasoning": <"2–3 sentences explaining your rating">,
  "has_profanity": <boolean>
}`;

/**
 * Build the full system prompt, optionally injecting approved example stories
 * so Claude calibrates to the coalition's exact standards.
 */
function buildSystemPrompt(exampleStories) {
  if (!exampleStories || !exampleStories.trim()) {
    return BASE_SYSTEM_PROMPT;
  }

  return `${BASE_SYSTEM_PROMPT}

──────────────────────────────────────
EXAMPLES OF PREVIOUSLY APPROVED STORIES (use these to calibrate your standards):

${exampleStories.trim()}
──────────────────────────────────────`;
}

/**
 * Score a single story. Returns the parsed result object.
 */
async function scoreStory(client, systemPrompt, story) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Review this story submission:\n\n${story.storyText}`,
      },
    ],
  });

  const text = response.content[0]?.text || '{}';

  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch {
    console.warn(`  Warning: Could not parse Claude response for vanId ${story.vanId}`);
    return {
      score: 0,
      recommendation: 'error',
      tags: [],
      headline: 'Parse error',
      highlight_quote: null,
      reasoning: 'Could not parse AI response.',
      has_profanity: false,
    };
  }
}

/**
 * Main export: score all stories, with concurrency control to avoid rate limits.
 * Returns array of { story, result } sorted by score descending.
 */
async function reviewStories(stories, { apiKey, exampleStories = '', concurrency = 3 }) {
  const client = new Anthropic({ apiKey });
  const systemPrompt = buildSystemPrompt(exampleStories);

  console.log(`  Scoring ${stories.length} stories (concurrency: ${concurrency})...`);

  const results = [];

  // Process in batches to respect rate limits
  for (let i = 0; i < stories.length; i += concurrency) {
    const batch = stories.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(async (story) => {
        try {
          const result = await scoreStory(client, systemPrompt, story);
          process.stdout.write('.');
          return { story, result };
        } catch (err) {
          console.warn(`\n  Error scoring vanId ${story.vanId}: ${err.message}`);
          return {
            story,
            result: {
              score: 0,
              recommendation: 'error',
              tags: [],
              headline: 'Review failed',
              highlight_quote: null,
              reasoning: `API error: ${err.message}`,
              has_profanity: false,
            },
          };
        }
      })
    );

    results.push(...batchResults);

    // Small delay between batches to be kind to the API
    if (i + concurrency < stories.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  process.stdout.write('\n');

  // Sort by score descending so the best stories are at the top of the digest
  results.sort((a, b) => (b.result.score || 0) - (a.result.score || 0));

  const summary = {
    total: results.length,
    approve: results.filter((r) => r.result.recommendation === 'approve').length,
    consider: results.filter((r) => r.result.recommendation === 'consider').length,
    flag_language: results.filter((r) => r.result.recommendation === 'flag_language').length,
    skip: results.filter((r) => r.result.recommendation === 'skip').length,
  };

  console.log(
    `  Results: ${summary.approve} approve | ${summary.consider} consider | ${summary.flag_language} flagged | ${summary.skip} skip`
  );

  return results;
}

module.exports = { reviewStories };
