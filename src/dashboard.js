/**
 * Dashboard Generator
 *
 * Builds a fully self-contained static HTML page with this week's scored
 * stories baked in as JSON. No API calls at view time — all scoring is
 * pre-computed by the pipeline. The file is deployed to GitHub Pages and
 * linked from the weekly email digest.
 *
 * Features:
 *   - Filter tabs: All / Approve / Consider / Flagged / Skip
 *   - Stories sorted by score descending
 *   - Individual story copy button
 *   - Full digest copy button
 *   - Coalition branding
 *   - Works in any browser, no dependencies
 */

const fs = require('fs');
const path = require('path');

function buildDashboardHtml(scoredStories, runDate, weekLabel) {
  const total   = scoredStories.length;
  const approve = scoredStories.filter(r => r.result.recommendation === 'approve').length;
  const consider= scoredStories.filter(r => r.result.recommendation === 'consider').length;
  const flagged = scoredStories.filter(r => r.result.recommendation === 'flag_language').length;
  const skip    = scoredStories.filter(r => r.result.recommendation === 'skip').length;

  // Embed scored data — results are pre-computed, no API calls needed at view time
  const dataJson = JSON.stringify(
    scoredStories.map(({ story, result }) => ({
      id:        story.vanId,
      firstName: story.firstName || '',
      lastName:  story.lastName  || '',
      state:     story.stateOrProvince || '',
      text:      story.storyText,
      rec:       result.recommendation,
      score:     result.score || 0,
      headline:  result.headline || '',
      quote:     result.highlight_quote || null,
      reasoning: result.reasoning || '',
      tags:      result.tags || [],
      profanity: result.has_profanity || false,
    })),
    null, 0
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Story Digest — ${weekLabel}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#F4F5F8;color:#111827;line-height:1.5}
a{color:inherit;text-decoration:none}

.topbar{background:#1B2D5B;color:#fff;padding:0}
.topbar-inner{max-width:900px;margin:0 auto;padding:20px 24px 0}
.topbar-accent{height:4px;background:#C8102E}
.org{font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,0.5);margin-bottom:8px}
.title{font-size:22px;font-weight:600;margin-bottom:4px}
.subtitle{font-size:13px;color:rgba(255,255,255,0.6);padding-bottom:16px}

.stats{background:rgba(0,0,0,0.2);border-top:1px solid rgba(255,255,255,0.1)}
.stats-inner{max-width:900px;margin:0 auto;display:grid;grid-template-columns:repeat(4,1fr)}
.stat{padding:12px 16px;text-align:center;border-right:1px solid rgba(255,255,255,0.12)}
.stat:last-child{border-right:none}
.stat-num{font-size:24px;font-weight:700}
.stat-lbl{font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:rgba(255,255,255,0.5);margin-top:2px}

.main{max-width:900px;margin:0 auto;padding:24px}

.toolbar{display:flex;align-items:center;gap:8px;margin-bottom:20px;flex-wrap:wrap}
.filters{display:flex;border-bottom:1px solid #DDE1EA;flex:1;min-width:0}
.ftab{background:none;border:none;border-bottom:2px solid transparent;padding:8px 14px 10px;font-size:13px;color:#6B7280;cursor:pointer;margin-bottom:-1px;font-family:inherit;white-space:nowrap}
.ftab.on{border-bottom-color:#1B2D5B;color:#1B2D5B;font-weight:500}
.ftab:hover:not(.on){color:#374151}
.copy-all{background:#1B2D5B;color:#fff;border:none;font-size:12px;font-weight:500;padding:8px 16px;border-radius:6px;cursor:pointer;white-space:nowrap;font-family:inherit}
.copy-all:hover{background:#243A73}

.cards{display:flex;flex-direction:column;gap:10px}
.card{background:#fff;border:1px solid #DDE1EA;border-left:4px solid #1B2D5B;border-radius:0 10px 10px 0;padding:16px 20px}
.card-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:8px}
.badges{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.badge{display:inline-block;font-size:10px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;padding:3px 9px;border-radius:3px}
.badge-approve{background:#E6F4EB;color:#1A6B2F}
.badge-consider{background:#FEF3E2;color:#854F0B}
.badge-flag{background:#E8F1FB;color:#185FA5}
.badge-skip{background:#F1EFE8;color:#5F5E5A}
.score{font-size:18px;font-weight:700;flex-shrink:0}
.score-hi{color:#22863A}.score-mid{color:#D97706}.score-lo{color:#DC2626}
.meta{font-size:12px;color:#6B7280;margin-bottom:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.form-tag{font-size:10px;padding:2px 7px;background:#EDF0F7;color:#374151;border-radius:3px}
.headline{font-size:15px;font-weight:600;color:#111827;margin-bottom:6px}
.quote-block{border-left:2px solid #1B2D5B;padding:5px 0 5px 12px;font-size:13px;font-style:italic;color:#374151;line-height:1.6;margin:10px 0}
.reasoning{font-size:13px;color:#4B5563;line-height:1.6;margin-bottom:8px}
.tags{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px}
.tag{font-size:11px;padding:2px 7px;background:#F1EFE8;color:#5F5E5A;border-radius:3px}
.card-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;border-top:1px solid #EEF0F4;padding-top:10px;margin-top:4px}
.toggle-btn{background:none;border:none;font-size:12px;color:#9CA3AF;cursor:pointer;font-family:inherit;padding:0}
.toggle-btn:hover{color:#4B5563}
.copy-story{background:none;border:1px solid #DDE1EA;font-size:11px;padding:4px 10px;border-radius:4px;cursor:pointer;color:#4B5563;font-family:inherit}
.copy-story:hover{background:#F9FAFB}
.copy-story.done{color:#22863A;border-color:#22863A}
.orig{font-size:12px;color:#4B5563;font-family:monospace;line-height:1.6;white-space:pre-wrap;margin-top:10px;padding:10px 12px;background:#F9FAFB;border-radius:6px;border:1px solid #EEF0F4}

.empty{text-align:center;padding:3rem;color:#9CA3AF;font-size:14px;background:#fff;border-radius:10px;border:1px dashed #DDE1EA}

.footer{max-width:900px;margin:0 auto;padding:16px 24px 32px;font-size:12px;color:#9CA3AF}
</style>
</head>
<body>

<div class="topbar">
  <div class="topbar-inner">
    <div class="org">Coalition to Strengthen America&rsquo;s Healthcare</div>
    <div class="title">Weekly Story Digest</div>
    <div class="subtitle">${weekLabel} &nbsp;&middot;&nbsp; ${total} submissions reviewed</div>
  </div>
  <div class="stats">
    <div class="stats-inner">
      <div class="stat"><div class="stat-num" style="color:#6EE7A0">${approve}</div><div class="stat-lbl">Ready to use</div></div>
      <div class="stat"><div class="stat-num" style="color:#FCD34D">${consider}</div><div class="stat-lbl">Worth a look</div></div>
      <div class="stat"><div class="stat-num" style="color:#93C5FD">${flagged}</div><div class="stat-lbl">Needs edit</div></div>
      <div class="stat"><div class="stat-num" style="color:rgba(255,255,255,0.3)">${skip}</div><div class="stat-lbl">Skipped</div></div>
    </div>
  </div>
  <div class="topbar-accent"></div>
</div>

<div class="main">
  <div class="toolbar">
    <div class="filters" id="filters">
      <button class="ftab on" data-filter="all">All</button>
      <button class="ftab" data-filter="approve">Approve</button>
      <button class="ftab" data-filter="consider">Consider</button>
      <button class="ftab" data-filter="flag_language">Flagged</button>
      <button class="ftab" data-filter="skip">Skip</button>
    </div>
    <button class="copy-all" id="copyAll">Copy digest</button>
  </div>
  <div class="cards" id="cards"></div>
</div>

<div class="footer">
  Generated ${runDate} &nbsp;&middot;&nbsp; Coalition Story Review Pipeline &nbsp;&middot;&nbsp;
  <a href="https://strengthenhealthcare.org" style="color:#9CA3AF">strengthenhealthcare.org</a>
</div>

<script>
const DATA = ${dataJson};
let filter = 'all';
let openCards = new Set();
let copiedCards = new Set();

function scoreClass(s){ return s>=7?'score-hi':s>=4?'score-mid':'score-lo'; }
function badgeHtml(rec, profanity){
  const map={approve:'badge-approve Approve',consider:'badge-consider Consider',flag_language:'badge-flag Flagged',skip:'badge-skip Skip'};
  const [cls,lbl]=(map[rec]||'badge-skip Skip').split(' ');
  let out=\`<span class="badge \${cls}">\${lbl}</span>\`;
  if(profanity) out+=\` <span class="badge badge-flag">language</span>\`;
  return out;
}

function renderCards(){
  const sorted = DATA
    .filter(d => filter==='all' || d.rec===filter)
    .sort((a,b)=>b.score-a.score);

  const container = document.getElementById('cards');
  if(!sorted.length){
    container.innerHTML='<div class="empty">No stories in this category.</div>';
    return;
  }

  container.innerHTML = sorted.map(d => {
    const who=[d.firstName,d.lastName].filter(Boolean).join(' ');
    const isOpen=openCards.has(d.id+d.text.slice(0,20));
    const isCopied=copiedCards.has(d.id+d.text.slice(0,20));
    const key=d.id+d.text.slice(0,20);
    return \`<div class="card" data-key="\${key}">
      <div class="card-top">
        <div class="badges">\${badgeHtml(d.rec,d.profanity)}</div>
        <div class="score \${scoreClass(d.score)}">\${d.score}/10</div>
      </div>
      \${who||d.state?\`<div class="meta">\${who?'<span>'+who+'</span>':''}<span class="form-tag">\${d.text.length>0?d.rec!=='skip'?d.score+'/10 &middot; ':''||''||''||''||''||''||''||'':''}\${'' }\${d.state||''}</span></div>\`:''}
      <div class="meta">\${who?'<span>'+who+'</span>&nbsp;&middot;&nbsp;':''}<span class="form-tag">\${d.state||'Submitted'}</span></div>
      <div class="headline">\${d.headline||''}</div>
      \${d.quote?\`<div class="quote-block">&ldquo;\${d.quote}&rdquo;</div>\`:''}
      <div class="reasoning">\${d.reasoning||''}</div>
      \${d.tags.length?\`<div class="tags">\${d.tags.map(t=>\`<span class="tag">\${t.replace(/_/g,' ')}</span>\`).join('')}</div>\`:''}
      <div class="card-footer">
        <button class="toggle-btn" data-key="\${key}">\${isOpen?'Hide':'View'} submission</button>
        <button class="copy-story \${isCopied?'done':''}" data-key="\${key}">\${isCopied?'Copied!':'Copy story'}</button>
      </div>
      \${isOpen?\`<div class="orig">\${d.text.replace(/</g,'&lt;')}</div>\`:''}
    </div>\`;
  }).join('');
}

document.getElementById('filters').addEventListener('click',e=>{
  const btn=e.target.closest('.ftab');
  if(!btn)return;
  document.querySelectorAll('.ftab').forEach(b=>b.classList.remove('on'));
  btn.classList.add('on');
  filter=btn.dataset.filter;
  renderCards();
});

document.getElementById('cards').addEventListener('click',e=>{
  const key=e.target.dataset.key;
  if(!key)return;
  if(e.target.classList.contains('toggle-btn')){
    if(openCards.has(key))openCards.delete(key);else openCards.add(key);
    renderCards();
  }
  if(e.target.classList.contains('copy-story')){
    const d=DATA.find(x=>x.id+x.text.slice(0,20)===key);
    if(!d)return;
    const lines=[d.headline||'Story','Score: '+d.score+'/10'];
    if(d.quote)lines.push('"'+d.quote+'"');
    lines.push(d.reasoning,'','Full story:',d.text);
    navigator.clipboard.writeText(lines.join('\\n')).then(()=>{
      copiedCards.add(key);
      renderCards();
      setTimeout(()=>{copiedCards.delete(key);renderCards();},2000);
    });
  }
});

document.getElementById('copyAll').addEventListener('click',function(){
  const a=DATA.filter(d=>d.rec==='approve').sort((x,y)=>y.score-x.score);
  const c=DATA.filter(d=>d.rec==='consider').sort((x,y)=>y.score-x.score);
  const f=DATA.filter(d=>d.rec==='flag_language').sort((x,y)=>y.score-x.score);
  const lines=["COALITION TO STRENGTHEN AMERICA'S HEALTHCARE","Weekly Story Digest — ${weekLabel}","=".repeat(56),""];
  [[a,"READY TO USE"],[c,"WORTH A LOOK"],[f,"NEEDS LANGUAGE EDIT"]].forEach(([items,label])=>{
    if(!items.length)return;
    lines.push(label+' ('+items.length+')',"-".repeat(40));
    items.forEach(d=>{
      const who=[d.firstName,d.lastName].filter(Boolean).join(' ');
      lines.push((d.headline||'No headline')+' | Score: '+d.score+'/10');
      if(who)lines.push('  '+who);
      if(d.quote)lines.push('  "'+d.quote+'"');
      lines.push('  '+d.reasoning,'');
    });
  });
  navigator.clipboard.writeText(lines.join('\\n')).then(()=>{
    this.textContent='Copied!';
    setTimeout(()=>this.textContent='Copy digest',2000);
  });
});

renderCards();
</script>
</body>
</html>`;
}

/**
 * Write the dashboard to docs/index.html (served by GitHub Pages).
 * Also writes a dated archive copy so previous weeks are preserved.
 */
function writeDashboard(scoredStories, { outputDir = 'docs' } = {}) {
  const now      = new Date();
  const runDate  = now.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  const weekSlug = now.toISOString().slice(0, 10);
  const weekLabel= runDate;

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const html = buildDashboardHtml(scoredStories, runDate, weekLabel);

  // Current week — GitHub Pages serves this at your-org.github.io/repo/
  fs.writeFileSync(path.join(outputDir, 'index.html'), html, 'utf8');

  // Dated archive — links in past emails keep working
  fs.writeFileSync(path.join(outputDir, `digest-${weekSlug}.html`), html, 'utf8');

  console.log(`  ✓ Dashboard written → ${outputDir}/index.html`);
  console.log(`  ✓ Archive copy     → ${outputDir}/digest-${weekSlug}.html`);

  return { indexPath: path.join(outputDir, 'index.html'), weekSlug };
}

module.exports = { writeDashboard };
