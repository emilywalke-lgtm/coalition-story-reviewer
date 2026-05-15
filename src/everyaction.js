/**
 * EveryAction API Client
 *
 * Fetches story submissions from EveryAction's Story Collection forms.
 * These use EveryAction's dedicated Stories API — NOT survey question
 * responses — so no Survey Question ID is needed.
 *
 * Auth: Basic auth, username = "AppName|DbMode", password = API key
 */

const axios = require('axios');

class EveryActionClient {
  constructor({ appName, apiKey, dbMode = 1 }) {
    this.http = axios.create({
      baseURL: 'https://api.securevan.com/v4',
      auth: {
        username: `${appName}|${dbMode}`,
        password: apiKey,
      },
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });
  }

  /**
   * Get all contacts who had a specific activist code applied
   * within the lookback window. Handles pagination automatically.
   */
  async getContactsWithActivistCode(activistCodeId, sinceDate) {
    const contacts = [];
    let skip = 0;
    const top = 50;
    const since = new Date(sinceDate);

    console.log(`  Fetching contacts with activist code ${activistCodeId} since ${sinceDate}...`);

    while (true) {
      const response = await this.http.get('/people', {
        params: { $top: top, $skip: skip, activistCodeId },
      });

      const items = response.data?.items || [];
      if (items.length === 0) break;

      // Filter to contacts modified within our lookback window
      const recent = items.filter(c => {
        const modified = new Date(c.dateModified || c.dateCreated || 0);
        return modified >= since;
      });

      contacts.push(...recent);

      if (items.length < top) break;

      // If oldest item on this page is before our window, stop paginating
      const oldest = new Date(items[items.length - 1]?.dateModified || 0);
      if (oldest < since) break;

      skip += top;
    }

    console.log(`  Found ${contacts.length} recent contacts.`);
    return contacts;
  }

  /**
   * Get story submissions for a contact using EveryAction's Stories API.
   * This is what Story Collection Forms use — separate from survey questions.
   * Returns the most recent story's text, or null if none found.
   */
  async getStoryText(vanId) {
    try {
      const response = await this.http.get(`/people/${vanId}/stories`);
      const stories = response.data?.items || response.data || [];

      if (!stories.length) return null;

      // Sort by date descending, return the most recent story's text
      stories.sort((a, b) =>
        new Date(b.dateModified || b.dateCreated || 0) -
        new Date(a.dateModified || a.dateCreated || 0)
      );

      return stories[0]?.storyText || stories[0]?.text || null;
    } catch (err) {
      if (err.response?.status === 404) return null;
      throw err;
    }
  }
}

/**
 * Main export: fetch recent story submissions from EveryAction.
 *
 * NOTE: Because your forms use EveryAction's Story Collection feature,
 * you only need:
 *   - EVERYACTION_APP_NAME
 *   - EVERYACTION_API_KEY
 *   - EVERYACTION_DB_MODE
 *   - EVERYACTION_FORM_ACTIVIST_CODE_ID  (one per form, or comma-separated list)
 *
 * No Survey Question ID needed.
 */
async function fetchRecentStories({
  appName,
  apiKey,
  dbMode,
  activistCodeId,
  lookbackHours,
}) {
  const client = new EveryActionClient({ appName, apiKey, dbMode });
  const sinceDate = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

  // Support comma-separated list of activist code IDs (one per form)
  const codeIds = String(activistCodeId).split(',').map(s => s.trim()).filter(Boolean);

  const allContacts = [];
  for (const codeId of codeIds) {
    const contacts = await client.getContactsWithActivistCode(codeId, sinceDate);
    allContacts.push(...contacts);
  }

  // Deduplicate by vanId (same person may have multiple codes)
  const seen = new Set();
  const unique = allContacts.filter(c => {
    if (seen.has(c.vanId)) return false;
    seen.add(c.vanId);
    return true;
  });

  console.log(`  ${unique.length} unique contacts after deduplication.`);

  // Pull story text for each contact
  const stories = [];
  for (const contact of unique) {
    const storyText = await client.getStoryText(contact.vanId);

    if (!storyText || storyText.trim().length < 20) continue;

    stories.push({
      vanId:           contact.vanId,
      firstName:       contact.firstName || '',
      lastName:        contact.lastName  || '',
      email:           contact.emails?.[0]?.email || '',
      stateOrProvince: contact.addresses?.[0]?.stateOrProvince || '',
      storyText:       storyText.trim(),
      submittedAt:     contact.dateModified || contact.dateCreated,
    });
  }

  console.log(`  Extracted ${stories.length} stories with text.`);
  return stories;
}

module.exports = { fetchRecentStories };
