#!/usr/bin/env node
/**
 * skills-registry — a static, reviewable index of agent skills.
 *
 * For each folder under <skillsDir> that contains a SKILL.md:
 *  - parses the frontmatter (name must match the folder, description required)
 *  - scans the text for risky patterns: pipe-to-shell installs, root or home
 *    deletes, credential-file references, dynamic eval, long embedded blobs
 *  - records a SHA-256 so a listing can be verified later
 *  - status: "checked" when every automated check passed, "flagged" otherwise
 *
 * "checked" means the automated checks passed. It is NOT a safety review and
 * says nothing about instruction quality. A human still reads the skill.
 *
 * Usage: node build-registry.mjs <skillsDir> <outDir>
 * Writes registry.json (machine-readable) and registry.html (searchable page).
 * Exit: 0 all checked · 1 any flagged · 2 usage error
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const MAX_SKILL_BYTES = 20000;

export const RISKY = [
  { id: 'pipe-to-shell', re: /(curl|wget)[^\n|]*\|\s*(sh|bash|zsh)\b/i, why: 'downloads and runs code without review' },
  { id: 'rm-root', re: /rm\s+-rf?\s+(\/|~|\$HOME)(\s|$)/i, why: 'deletes from the root or home folder' },
  { id: 'credential-read', re: /(\.ssh|\.aws|\.npmrc|\.netrc|id_rsa|\.env\b)/i, why: 'mentions credential files' },
  { id: 'dynamic-eval', re: /\beval\s*\(|new Function\s*\(/i, why: 'evaluates dynamic code' },
  { id: 'iex', re: /\b(Invoke-Expression|iex)\s*[(\$'"]/i, why: 'runs code built at runtime (PowerShell)' },
  { id: 'decode-and-run', re: /base64\s+(-d|--decode)[^\n|]*\|\s*(sh|bash|zsh)\b/i, why: 'decodes a hidden payload and runs it' },
  { id: 'chmod-world-writable', re: /chmod\s+(-R\s+)?777\b/i, why: 'makes files writable by everyone' },
  { id: 'long-base64', re: /[A-Za-z0-9+/]{200,}={0,2}/, why: 'contains a long encoded blob' },
];

export function parseFrontmatter(text) {
  // Normalize CRLF first: Windows checkouts would otherwise look like they have no frontmatter.
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(text.replace(/\r\n/g, '\n'));
  if (!m) return null;
  const get = (k) => (new RegExp(`^${k}:\\s*(.+)$`, 'm').exec(m[1])?.[1] ?? '').trim();
  return { name: get('name'), description: get('description') };
}

export function checkSkill(folder, name, text) {
  const errors = [];
  const flags = [];
  const fm = parseFrontmatter(text);
  if (!fm) errors.push('no frontmatter');
  else {
    if (fm.name !== name) errors.push(`frontmatter name "${fm.name}" does not match folder "${name}"`);
    if (!fm.description) errors.push('no description');
  }
  if (text.length > MAX_SKILL_BYTES) errors.push(`SKILL.md is over ${MAX_SKILL_BYTES / 1000} KB; keep skills focused`);
  for (const r of RISKY) if (r.re.test(text)) flags.push({ id: r.id, why: r.why });
  const status = errors.length || flags.length ? 'flagged' : 'checked';
  return { name, status, errors, flags, description: fm?.description ?? '' };
}

export function buildRegistry(skillsDir) {
  const entries = [];
  for (const name of readdirSync(skillsDir).sort()) {
    const dir = join(skillsDir, name);
    const file = join(dir, 'SKILL.md');
    if (!statSync(dir).isDirectory() || !existsSync(file)) continue;
    const bytes = readFileSync(file);
    const entry = checkSkill(dir, name, bytes.toString('utf8'));
    entries.push({ ...entry, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  const summary = {
    total: entries.length,
    checked: entries.filter((e) => e.status === 'checked').length,
    flagged: entries.filter((e) => e.status === 'flagged').length,
  };
  return { generatedAt: new Date().toISOString(), summary, skills: entries };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const STYLE = `
:root{--bg:#0b0b0f;--panel:#17171f;--line:#26262f;--txt:#f5f5f7;--mut:#a7a7b3;--dim:#6d6d7a;--ok:#2dd4bf;--bad:#f87171}
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(60% 40% at 80% -10%,rgba(45,212,191,.16),transparent 70%),radial-gradient(50% 35% at 0% 0%,rgba(124,58,237,.18),transparent 70%),var(--bg);color:var(--txt);font:15px/1.55 system-ui,-apple-system,Segoe UI,sans-serif;min-height:100vh}
header{padding:72px 6vw 28px;animation:rise .9s cubic-bezier(.22,1,.36,1) both}
.kicker{letter-spacing:.18em;text-transform:uppercase;font-size:12px;color:var(--ok);margin:0 0 12px}
h1{font-size:clamp(40px,6vw,76px);line-height:1;margin:0 0 16px;letter-spacing:-.02em}
.lede{color:var(--mut);max-width:62ch;margin:0}
.stats{display:flex;gap:12px;flex-wrap:wrap;margin:28px 0 0}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px 18px;min-width:132px}
.stat b{display:block;font-size:28px}
.stat span{color:var(--mut);font-size:13px}
.bar{position:sticky;top:0;z-index:2;backdrop-filter:blur(12px);background:rgba(11,11,15,.82);border-block:1px solid var(--line);padding:14px 6vw;display:flex;gap:12px;flex-wrap:wrap;align-items:center}
input[type=search]{flex:1 1 260px;background:var(--panel);color:var(--txt);border:1px solid var(--line);border-radius:999px;padding:10px 18px;font:inherit;outline:none}
input[type=search]:focus{border-color:var(--ok);box-shadow:0 0 0 3px rgba(45,212,191,.2)}
.pill{background:transparent;color:var(--mut);border:1px solid var(--line);border-radius:999px;padding:8px 16px;font:inherit;cursor:pointer}
.pill[aria-pressed=true]{color:var(--bg);background:var(--ok);border-color:var(--ok)}
main{padding:28px 6vw 80px;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:22px;display:flex;flex-direction:column;gap:12px;animation:rise .7s cubic-bezier(.22,1,.36,1) both;transition:transform .35s cubic-bezier(.22,1,.36,1),border-color .35s}
.card:hover{transform:translateY(-4px);border-color:#3b3b48}
.card h2{font-size:18px;margin:0;word-break:break-word}
.badge{align-self:flex-start;font-size:12px;font-weight:600;padding:4px 10px;border-radius:999px}
.checked .badge{background:rgba(45,212,191,.14);color:var(--ok)}
.flagged .badge{background:rgba(248,113,113,.14);color:var(--bad)}
.desc{color:var(--mut);margin:0}
.notes{margin:0;padding-left:18px;color:var(--mut);font-size:13px}
.notes li.bad{color:var(--bad)}
.hash{font:12px ui-monospace,Consolas,monospace;color:var(--dim)}
.empty{color:var(--mut);grid-column:1/-1;display:none}
footer{padding:0 6vw 56px;color:var(--dim);font-size:13px;max-width:80ch}
@keyframes rise{from{opacity:0;transform:translateY(22px);filter:blur(4px)}to{opacity:1;transform:none;filter:none}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

const SCRIPT = `
(function(){
  var q=document.getElementById('q'),btns=[].slice.call(document.querySelectorAll('.pill')),cards=[].slice.call(document.querySelectorAll('.card')),empty=document.getElementById('empty');
  var filter='all';
  function apply(){
    var term=q.value.trim().toLowerCase(),shown=0;
    cards.forEach(function(c){
      var ok=(filter==='all'||c.dataset.status===filter)&&(!term||c.dataset.search.indexOf(term)!==-1);
      c.hidden=!ok; if(ok) shown++;
    });
    empty.style.display=shown?'none':'block';
  }
  btns.forEach(function(b){b.addEventListener('click',function(){filter=b.dataset.filter;btns.forEach(function(x){x.setAttribute('aria-pressed',String(x===b))});apply();});});
  q.addEventListener('input',apply);
})();`;

export function renderHtml(registry) {
  const { summary } = registry;
  const cards = registry.skills
    .map((s) => {
      const notes = [
        ...s.errors.map((e) => ({ bad: true, text: e })),
        ...s.flags.map((f) => ({ bad: true, text: `${f.id}: ${f.why}` })),
      ];
      const noteItems = notes.length
        ? notes.map((n) => `<li class="${n.bad ? 'bad' : ''}">${esc(n.text)}</li>`).join('')
        : '<li>No automated issues found</li>';
      const search = `${s.name} ${s.description}`.toLowerCase();
      return `<article class="card ${s.status}" data-status="${s.status}" data-search="${esc(search)}">
  <span class="badge">${s.status === 'checked' ? 'Checked' : 'Flagged'}</span>
  <h2>${esc(s.name)}</h2>
  <p class="desc">${esc(s.description || 'No description')}</p>
  <ul class="notes">${noteItems}</ul>
  <span class="hash" title="Verify with: shasum -a 256 SKILL.md">sha256 ${s.sha256.slice(0, 16)}…</span>
</article>`;
    })
    .join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Skills registry</title>
<meta name="description" content="A reviewable index of agent skills with automated safety checks and SHA-256 digests.">
<style>${STYLE}</style>
</head>
<body>
<header>
  <p class="kicker">Skills registry</p>
  <h1>Every skill, checked before you install it.</h1>
  <p class="lede">Automated checks look for risky patterns and broken metadata, then pin each skill to a SHA-256 digest. "Checked" means the checks passed. It is not a safety review.</p>
  <div class="stats">
    <div class="stat"><b>${summary.total}</b><span>skills indexed</span></div>
    <div class="stat"><b>${summary.checked}</b><span>checked</span></div>
    <div class="stat"><b>${summary.flagged}</b><span>flagged</span></div>
  </div>
</header>
<nav class="bar" aria-label="Filter skills">
  <input id="q" type="search" placeholder="Search skills" aria-label="Search skills">
  <button class="pill" data-filter="all" aria-pressed="true">All</button>
  <button class="pill" data-filter="checked" aria-pressed="false">Checked</button>
  <button class="pill" data-filter="flagged" aria-pressed="false">Flagged</button>
</nav>
<main>
${cards}
<p id="empty" class="empty">No skills match that search.</p>
</main>
<footer>Generated ${esc(registry.generatedAt)}. Digests change when SKILL.md changes; re-run the builder after every edit and compare the hash before installing.</footer>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

function main() {
  const [skillsDir, outDir] = process.argv.slice(2);
  if (!skillsDir || !outDir) {
    console.error('usage: node build-registry.mjs <skillsDir> <outDir>');
    process.exitCode = 2;
    return;
  }
  const registry = buildRegistry(skillsDir);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'registry.json'), JSON.stringify(registry, null, 2) + '\n');
  writeFileSync(join(outDir, 'registry.html'), renderHtml(registry));
  console.log(`${registry.summary.checked} checked, ${registry.summary.flagged} flagged -> ${outDir}`);
  process.exitCode = registry.summary.flagged > 0 ? 1 : 0;
}

if (process.argv[1]?.endsWith('build-registry.mjs')) {
  // A missing or unreadable skills folder exits 2 with one line, never a stack trace.
  try {
    main();
  } catch (e) {
    console.error(`cannot build registry: ${e.message}`);
    process.exitCode = 2;
  }
}
