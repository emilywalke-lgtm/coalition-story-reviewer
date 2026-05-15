/**
 * EveryAction API Client
 *
 * Fetches digital action form submissions and extracts story text
 * from survey question responses.
 *
 * EveryAction auth: Basic auth with username = "AppName|DbMode", password = API key
 * API docs: https://docs.everyaction.com/reference
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
   * Fetch all contacts who had a specific activist code applied within
   * the lookback window. This catches everyone who submitted the form.
   *
   * EveryAction applies an activist code to contacts upon form submission —
   * find your form's activist code ID in:
   *   Settings → Activist Codes → [your form's code]
   */
  async getContactsWithActivistCode(activistCodeId, sinceDate) {
    const contacts = [];
    let skip = 0;
    const top = 50;

    console.log(`  Fetching contacts with activist code ${activistCodeId} since ${sinceDate}...`);

    while (true) {
      const response = await this.http.get('/people', {
        params: {
          $top: top,
          $skip: skip,
          activistCodeId,
          // EveryAction filters by activist code presence, not application date.
          // We filter by date in the next step using the contact's dateModified.
        },
      });

      const items = response.data?.items || [];
      if (items.length === 0) break;

      // Filter to contacts created/modified since our lookback window
      const since = new Date(sinceDate);
      const recent = items.filter(c => {
        const modified = new Date(c.dateModified || c.dateCreated || 0);
        return modified >= since;
      });

      contacts.push(...recent);

      if (items.length < top) break;
      skip += top;

      // If all items in this page are older than sinceDate, stop paginating
      const oldestOnPage = new Date(items[items.length - 1]?.dateModified || 0);
      if (oldestOnPage < since) break;
    }

    console.log(`  Found ${contacts.length} recent contacts.`);
    return contacts;
  }

  /**
   * Get the story text for a contact from their survey question responses.
   * The storyQuestionId is the Survey Question ID for your "Tell us your story" field.
   */
  async getStoryText(vanId, storyQuestionId) {
    try {
      const response = await this.http.get(`/people/${vanId}/surveyResponses`);
      const responses = response.data || [];

      const storyResponse = responses.find(
        r => r.surveyQuestionId === storyQuestionId
      );

      // Survey responses can be structured in two ways depending on question type:
      // 1. Free-text: storyResponse.responses[0].responses[0].mediumName (the text)
      // 2. Or directly: storyResponse.responses[0].mediumName
      if (!storyResponse) return null;

      const inner = storyResponse.responses?.[0];
      if (!inner) return null;

      // Free-text question: text lives in mediumName or responses[0].mediumName
      return inner.responses?.[0]?.mediumName
        || inner.mediumName
        || null;
    } catch (err) {
      // Contact may have no survey responses — not an error
      if (err.response?.status === 404) return null;
      throw err;
    }
  }

  /**
   * Alternate method: pull story from the contact's Notes (some orgs store
   * form responses as notes rather than survey responses).
   * Uncomment and call this instead of getStoryText if your org uses notes.
   */
  async getStoryFromNotes(vanId) {
    try {
      const response = await this.http.get(`/people/${vanId}/notes`);
      const notes = response.data?.items || [];
      // Return the most recent note's text
      if (notes.length === 0) return null;
      notes.sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated));
      return notes[0]?.text || null;
    } catch (err) {
      if (err.response?.status === 404) return null;
      throw err;
    }
  }
}

/**
 * Main export: fetch recent story submissions from EveryAction.
 * Returns an array of { vanId, firstName, lastName, email, storyText, submittedAt }
 */
async function fetchRecentStories({
  appName,
  apiKey,
  dbMode,
  storyQuestionId,
  activistCodeId,
  lookbackHours,
}) {
  const client = new EveryActionClient({ appName, apiKey, dbMode });

  const sinceDate = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

  const contacts = await client.getContactsWithActivistCode(activistCodeId, sinceDate);

  const stories = [];

  for (const contact of contacts) {
    const storyText = await client.getStoryText(contact.vanId, storyQuestionId);

    if (!storyText || storyText.trim().length < 20) {
      // Skip empty or near-empty submissions
      continue;
    }

    stories.push({
      vanId: contact.vanId,
      firstName: contact.firstName || '',
      lastName: contact.lastName || '',
      email: contact.emails?.[0]?.email || '',
      stateOrProvince: contact.addresses?.[0]?.stateOrProvince || '',
      storyText: storyText.trim(),
      submittedAt: contact.dateModified || contact.dateCreated,
    });
  }

  console.log(`  Extracted ${stories.length} stories with text.`);
  return stories;
}

module.exports = { fetchRecentStories };
