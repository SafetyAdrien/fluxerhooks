// Extrait de CHANGELOG.md la section « ## beta<N> » (audit log d'une version) pour la description d'une release GitHub.
// Usage : node scripts/release-notes.js <N|betaN> [CHANGELOG.md] > notes.md
const fs = require('fs');
const arg = (process.argv[2] || '').replace(/^beta/, '');
const file = process.argv[3] || 'CHANGELOG.md';
if (!/^\d+$/.test(arg)) throw new Error('Usage : release-notes.js <N> [CHANGELOG.md]');
const lines = fs.readFileSync(file, 'utf8').split('\n');
const start = lines.findIndex((l) => l.trim() === `## beta${arg}`);
if (start < 0) {
  console.error(`Aucune section « ## beta${arg} » dans ${file}`);
  process.exit(1);
}
let end = lines.findIndex((l, i) => i > start && /^(## |---\s*$)/.test(l));
if (end < 0) end = lines.length;
const body = lines.slice(start + 1, end).join('\n').trim();
const repo = process.env.GITHUB_REPOSITORY || 'SafetyAdrien/fluxerhooks';
const branch = process.env.NOTES_BRANCH || 'desktop';
const label = process.env.NOTES_LABEL ? ` ${process.env.NOTES_LABEL}` : '';
console.log(`## Audit log — FluxerHooks-beta${arg}${label}\n\n${body}\n\n---\nJournal complet de toutes les versions : [${file}](https://github.com/${repo}/blob/${branch}/${file})`);
