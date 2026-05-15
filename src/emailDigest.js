/**
 * Email Digest — Coalition to Strengthen America's Healthcare
 *
 * Sends a branded summary email with a prominent CTA button
 * linking to the full interactive dashboard (GitHub Pages).
 *
 * The email shows the top stories as a preview. The real work
 * happens when the recipient clicks through to the dashboard,
 * where they can filter, sort, and copy stories.
 */

const sgMail = require('@sendgrid/mail');

const NAVY     = '#1B2D5B';
const NAVY_DK  = '#111D3B';
const RED      = '#C8102E';
const WHITE    = '#FFFFFF';
const PAGE_BG  = '#F4F5F8';
const BORDER   = '#DDE1EA';
const TEXT     = '#111827';
const MUTED    = '#6B7280';

const REC = {
  approve:       { label: 'Ready to use',           bg: '#E6F4EB', color: '#1A6B2F', bar: '#22863A' },
  consider:      { label: 'Worth a look',            bg: '#FEF3E2', color: '#854F0B', bar: '#D97706' },
  flag_language: { label: 'Needs language edit',     bg: '#E8F1FB', color: '#185FA5', bar: '#2563EB' },
};

// ── Inline story card (preview in email) ─────────────────────────────────────

function previewCard(item, idx) {
  const { story, result } = item;
  const rec  = REC[result.recommendation];
  if (!rec) return '';
  const who  = [story.firstName, story.lastName].filter(Boolean).join(' ');
  const rowBg = idx % 2 === 0 ? WHITE : '#FAFBFD';

  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${rowBg};border:1px solid ${BORDER};border-left:4px solid ${NAVY};border-radius:0 8px 8px 0;margin-bottom:10px;">
    <tr><td style="padding:14px 18px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:6px;">
        <tr>
          <td><span style="display:inline-block;background:${rec.bg};color:${rec.color};font-size:10px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;padding:3px 9px;border-radius:3px;font-family:Arial,sans-serif;">${rec.label}</span></td>
          <td align="right" style="font-size:16px;font-weight:700;color:${result.score >= 7 ? '#22863A' : result.score >= 4 ? '#D97706' : '#DC2626'};font-family:Arial,sans-serif;">${result.score || 0}/10</td>
        </tr>
      </table>
      ${who ? `<div style="font-size:12px;color:${MUTED};margin-bottom:6px;font-family:Arial,sans-serif;">${who}${story.stateOrProvince ? ' &nbsp;&middot;&nbsp; ' + story.stateOrProvince : ''}</div>` : ''}
      <div style="font-size:15px;font-weight:700;color:${TEXT};margin-bottom:6px;font-family:Arial,sans-serif;">${result.headline || ''}</div>
      ${result.highlight_quote ? `<div style="border-left:2px solid ${NAVY};padding:4px 0 4px 12px;font-size:13px;font-style:italic;color:#374151;line-height:1.6;margin:8px 0;font-family:Georgia,'Times New Roman',serif;">&ldquo;${result.highlight_quote}&rdquo;</div>` : ''}
      <div style="font-size:13px;color:${MUTED};line-height:1.6;font-family:Arial,sans-serif;">${result.reasoning || ''}</div>
    </td></tr>
  </table>`;
}

// ── Full HTML email ───────────────────────────────────────────────────────────

function buildHtml(stories, runDate, stats, dashboardUrl) {
  const approved = stories.filter(r => r.result.recommendation === 'approve');
  const consider = stories.filter(r => r.result.recommendation === 'consider');
  const flagged  = stories.filter(r => r.result.recommendation === 'flag_language');

  // Show up to 3 preview cards per section in the email
  const previewApproved = approved.slice(0, 3);
  const previewConsider = consider.slice(0, 2);
  const hasMore = approved.length > 3 || consider.length > 2 || flagged.length > 0;

  function statCell(label, count, numColor) {
    return `<td align="center" style="padding:14px 16px;border-right:1px solid rgba(255,255,255,0.12);">
      <div style="font-size:24px;font-weight:700;color:${numColor};font-family:Arial,sans-serif;">${count}</div>
      <div style="font-size:10px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.5px;margin-top:3px;font-family:Arial,sans-serif;">${label}</div>
    </td>`;
  }

  function sectionHeader(title, count) {
    return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
      <tr><td style="border-bottom:2px solid ${NAVY};padding-bottom:8px;">
        <span style="font-size:15px;font-weight:700;color:${NAVY};font-family:Arial,sans-serif;">${title}</span>
        <span style="font-size:14px;color:${MUTED};font-family:Arial,sans-serif;"> (${count})</span>
      </td></tr>
    </table>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Story Digest &middot; ${runDate}</title></head>
<body style="margin:0;padding:0;background:${PAGE_BG};">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE_BG};padding:28px 0;">
<tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="background:${WHITE};border-radius:8px;overflow:hidden;border:1px solid ${BORDER};">

  <!-- Red accent bar -->
  <tr><td style="background:${RED};height:5px;font-size:0;">&nbsp;</td></tr>

  <!-- Header -->
  <tr><td style="background:${NAVY};padding:22px 32px 0;">
    <div style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,0.5);margin-bottom:8px;font-family:Arial,sans-serif;">Coalition to Strengthen America&rsquo;s Healthcare</div>
    <div style="font-size:24px;font-weight:700;color:${WHITE};font-family:Arial,sans-serif;">Weekly Story Digest</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.6);margin-top:4px;padding-bottom:18px;font-family:Arial,sans-serif;">${runDate}</div>
    <!-- Stats strip -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(0,0,0,0.22);border-top:1px solid rgba(255,255,255,0.1);">
      <tr>
        ${statCell('Ready to use', approved.length, '#6EE7A0')}
        ${statCell('Worth a look', consider.length, '#FCD34D')}
        ${statCell('Needs edit',   flagged.length,  '#93C5FD')}
        <td align="center" style="padding:14px 16px;">
          <div style="font-size:24px;font-weight:700;color:rgba(255,255,255,0.3);font-family:Arial,sans-serif;">${stats.skipped}</div>
          <div style="font-size:10px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.5px;margin-top:3px;font-family:Arial,sans-serif;">Skipped</div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Dashboard CTA -->
  <tr><td style="padding:24px 32px 20px;border-bottom:1px solid ${BORDER};background:#FAFBFD;text-align:center;">
    <div style="font-size:14px;color:${MUTED};margin-bottom:16px;font-family:Arial,sans-serif;">
      Review, filter, and copy this week&rsquo;s stories in the full interactive dashboard.
    </div>
    <a href="${dashboardUrl}" style="display:inline-block;background:${NAVY};color:${WHITE};font-size:14px;font-weight:700;padding:12px 32px;border-radius:6px;text-decoration:none;font-family:Arial,sans-serif;">
      Open full digest &rarr;
    </a>
    <div style="font-size:11px;color:#9CA3AF;margin-top:10px;font-family:Arial,sans-serif;">Filter by approve / consider / flagged &nbsp;&middot;&nbsp; Copy individual stories &nbsp;&middot;&nbsp; View full submissions</div>
  </td></tr>

  <!-- Story previews -->
  <tr><td style="padding:24px 32px;">

    ${previewApproved.length ? `
      ${sectionHeader('✓ Ready to use', approved.length)}
      ${previewApproved.map((item, i) => previewCard(item, i)).join('')}
      ${approved.length > 3 ? `<p style="font-size:13px;color:${MUTED};margin:4px 0 20px;font-family:Arial,sans-serif;">+${approved.length - 3} more in the dashboard</p>` : '<div style="margin-bottom:20px;"></div>'}
    ` : ''}

    ${previewConsider.length ? `
      ${sectionHeader('◎ Worth a look', consider.length)}
      ${previewConsider.map((item, i) => previewCard(item, i)).join('')}
      ${consider.length > 2 ? `<p style="font-size:13px;color:${MUTED};margin:4px 0 20px;font-family:Arial,sans-serif;">+${consider.length - 2} more in the dashboard</p>` : '<div style="margin-bottom:20px;"></div>'}
    ` : ''}

    ${flagged.length ? `
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#EEF4FF;border:1px solid #93C5FD;border-radius:6px;margin-bottom:20px;">
        <tr><td style="padding:12px 16px;">
          <div style="font-size:13px;font-weight:700;color:#185FA5;margin-bottom:4px;font-family:Arial,sans-serif;">⚑ ${flagged.length} good ${flagged.length === 1 ? 'story' : 'stories'} flagged for language review</div>
          <div style="font-size:13px;color:#374151;font-family:Arial,sans-serif;">These have strong content but need editing before publishing. Review them in the dashboard.</div>
        </td></tr>
      </table>
    ` : ''}

    <!-- Bottom CTA -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE_BG};border-radius:8px;margin-top:8px;">
      <tr><td style="padding:16px;text-align:center;">
        <a href="${dashboardUrl}" style="display:inline-block;background:${NAVY};color:${WHITE};font-size:13px;font-weight:700;padding:10px 24px;border-radius:6px;text-decoration:none;font-family:Arial,sans-serif;">
          See all ${stories.length} stories &rarr;
        </a>
      </td></tr>
    </table>

  </td></tr>

  <!-- Footer -->
  <tr><td style="background:${NAVY_DK};padding:18px 32px;">
    <div style="font-size:11px;color:rgba(255,255,255,0.45);line-height:1.7;font-family:Arial,sans-serif;">
      Generated by the Coalition Story Review Pipeline. All stories are AI-scored and must be reviewed by staff before publication.<br>
      <a href="https://strengthenhealthcare.org" style="color:rgba(255,255,255,0.45);">strengthenhealthcare.org</a>
      &nbsp;&middot;&nbsp;
      <a href="${dashboardUrl}" style="color:rgba(255,255,255,0.45);">View dashboard</a>
    </div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ── Plain text fallback ────────────────────────────────────────────────────────

function buildText(stories, runDate, dashboardUrl) {
  const lines = [
    "COALITION TO STRENGTHEN AMERICA'S HEALTHCARE",
    'Weekly Story Digest',
    runDate,
    '='.repeat(56),
    '',
    `Review the full interactive digest: ${dashboardUrl}`,
    '(Filter by category, copy stories, view full submissions)',
    '',
  ];
  for (const { label, recs } of [
    { label: 'READY TO USE',        recs: ['approve'] },
    { label: 'WORTH A LOOK',        recs: ['consider'] },
    { label: 'NEEDS LANGUAGE EDIT', recs: ['flag_language'] },
  ]) {
    const items = stories.filter(r => recs.includes(r.result.recommendation));
    if (!items.length) continue;
    lines.push(`${label} (${items.length})`, '-'.repeat(40));
    items.forEach(({ story, result }) => {
      const who = [story.firstName, story.lastName, story.stateOrProvince].filter(Boolean).join(' · ');
      lines.push(`${result.headline || 'No headline'} | Score: ${result.score}/10`);
      if (who) lines.push(`  ${who}`);
      if (result.highlight_quote) lines.push(`  "${result.highlight_quote}"`);
      lines.push(`  ${result.reasoning}`, '');
    });
  }
  return lines.join('\n');
}

// ── Main export ───────────────────────────────────────────────────────────────

async function sendDigest(stories, { apiKey, from, fromName, to, dashboardUrl, dryRun = false }) {
  const runDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const stats = {
    total:   stories.length,
    approve: stories.filter(r => r.result.recommendation === 'approve').length,
    consider:stories.filter(r => r.result.recommendation === 'consider').length,
    flagged: stories.filter(r => r.result.recommendation === 'flag_language').length,
    skipped: stories.filter(r => r.result.recommendation === 'skip').length,
  };

  const url     = dashboardUrl || 'https://your-org.github.io/coalition-story-reviewer/';
  const subject = `Story Digest · ${runDate} · ${stats.approve} ready to use`;
  const html    = buildHtml(stories, runDate, stats, url);
  const text    = buildText(stories, runDate, url);

  if (dryRun) {
    console.log('\n── DRY RUN ─────────────────────────────────────────────────');
    console.log(`To:        ${to.join(', ')}`);
    console.log(`Subject:   ${subject}`);
    console.log(`Dashboard: ${url}`);
    console.log(`Stats:     ${stats.approve} approve | ${stats.consider} consider | ${stats.flagged} flagged | ${stats.skipped} skip`);
    console.log('\n' + text.split('\n').slice(0, 20).join('\n'));
    console.log('────────────────────────────────────────────────────────────\n');
    return { subject, html, text, stats };
  }

  sgMail.setApiKey(apiKey);
  await sgMail.send({
    to:      to.map(e => ({ email: e.trim() })),
    from:    { email: from, name: fromName || 'Coalition Story Review' },
    subject, text, html,
  });

  console.log(`  ✓ Digest sent → ${to.join(', ')}`);
  return { subject, stats };
}

module.exports = { sendDigest };
