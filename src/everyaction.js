/**
 * EveryAction API Client — uses ChangedEntityExportJobs
 *
 * The proper way to bulk-pull form submissions: create an export job
 * for "ContactsOnlineForms" filtered by date range, poll until ready,
 * then download the CSV.
 */

const axios = require('axios');

class EveryActionClient {
  constructor({ appName, apiKey, dbMode = 1 }) {
    this.http = axios.create({
      baseURL: 'https://api.securevan.com/v4',
      auth: { username: `${appName}|${dbMode}`, password: apiKey },
      headers: { 'Content-Type': 'application/json' },
      timeout: 60000,
    });
  }

  /**
   * Create a Changed Entity Export job for ContactsOnlineForms
   * within the given date range.
   */
  async createExportJob(resourceType, sinceDate, requestedFields) {
    const body = {
      dateChangedFrom: sinceDate,
      resourceType,
      requestedFields,
      fileSizeKbLimit: 50000,
    };

    const response = await this.http.post('/changedEntityExportJobs', body);
    return response.data;
  }

  /**
   * Poll until the export job is complete, then return its file URLs.
   */
  async waitForExportJob(jobId, maxWaitSec = 300) {
    const start = Date.now();
    while ((Date.now() - start) / 1000 < maxWaitSec) {
      await new Promise(r => setTimeout(r, 5000));
      const response = await this.http.get(`/changedEntityExportJobs/${jobId}`);
      const status = response.data?.jobStatus;
      console.log(`  Export job status: ${status}`);
      if (status === 'Complete') return response.data;
      if (status === 'Error' || status === 'Cancelled') {
        throw new Error(`Export job failed: ${response.data?.message || status}`);
      }
    }
    throw new Error('Export job timed out');
  }

  /**
   * Download a CSV file from the export and parse to rows.
   */
  async downloadCsv(url) {
    const response = await axios.get(url, { responseType: 'text', timeout: 60000 });
    return this.parseCsv(response.data);
  }

  parseCsv(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length === 0) return [];
    const headers = this.splitCsvLine(lines[0]);
    return lines.slice(1).map(line => {
      const vals = this.splitCsvLine(line);
      const row = {};
      headers.forEach((h, i) => { row[h] = vals[i] || ''; });
      return row;
    });
  }

  splitCsvLine(line) {
    const fields = [];
    let cur = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i+1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === ',' && !inQuote) {
        fields.push(cur); cur = '';
      } else cur += ch;
    }
    fields.push(cur);
    return fields;
  }
}

/**
 * Pull recent story form submissions.
 */
async function fetchRecentStories({ appName, apiKey, dbMode, activistCodeId, lookbackHours }) {
  const client = new EveryActionClient({ appName, apiKey, dbMode });
  const sinceDate = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

  console.log(`  Creating export job for ContactsOnlineForms since ${sinceDate}...`);

  // Fields we want from each submission
  const fields = ['VanID', 'FirstName', 'LastName', 'StateOrProvince', 'DateCreated', 'StoryText', 'OnlineFormName'];

  const job = await client.createExportJob('ContactsOnlineForms', sinceDate, fields);
  const jobId = job.exportJobId || job.jobId || job.id;
  console.log(`  Export job created: ${jobId}`);

  const completed = await client.waitForExportJob(jobId);
  const files = completed.files || [];
  console.log(`  Downloading ${files.length} file(s)...`);

  const allRows = [];
  for (const file of files) {
    const rows = await client.downloadCsv(file.downloadUrl);
    allRows.push(...rows);
  }

  console.log(`  Got ${allRows.length} rows from export.`);

  // Convert rows to story objects, filter for ones with real story text
  const stories = allRows
    .map(row => ({
      vanId:           row.VanID || row.vanId,
      firstName:       row.FirstName || '',
      lastName:        row.LastName || '',
      stateOrProvince: row.StateOrProvince || '',
      formName:        row.OnlineFormName || '',
      storyText:       (row.StoryText || '').trim(),
      submittedAt:     row.DateCreated || '',
    }))
    .filter(s => s.storyText.length >= 20);

  console.log(`  ${stories.length} stories with usable text.`);
  return stories;
}

module.exports = { fetchRecentStories };
