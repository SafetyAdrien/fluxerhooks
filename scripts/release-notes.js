// Extrait de CHANGELOG.md la section « ## beta-0.0.<N> » (audit log d'une version) pour la description d'une release GitHub.
// Usage : node scripts/release-notes.js <beta-0.0.N|0.0.N|N> [CHANGELOG.md] > notes.md
const fs = require('fs');
const raw = String(process.argv[2] || '');
const m = /^(?:beta-?)?(?:0\.0\.)?(\d+)$/.exec(raw.trim());
if (!m) throw new Error('Usage : release-notes.js <beta-0.0.N> [CHANGELOG.md]');
const version = `beta-0.0.${m[1]}`;
const file = process.argv[3] || 'CHANGELOG.md';
const lines = fs.readFileSync(file, 'utf8').split('\n');
const start = lines.findIndex((l) => l.trim() === `## ${version}`);
if (start < 0) {
  console.error(`Aucune section « ## ${version} » dans ${file}`);
  process.exit(1);
}
let end = lines.findIndex((l, i) => i > start && /^(## |---\s*$)/.test(l));
if (end < 0) end = lines.length;
const body = lines.slice(start + 1, end).join('\n').trim();
const repo = process.env.GITHUB_REPOSITORY || 'SafetyAdrien/fluxerhooks';
const branch = process.env.NOTES_BRANCH || 'mobile';
const label = process.env.NOTES_LABEL ? ` ${process.env.NOTES_LABEL}` : '';
console.log(`## Audit log — FluxerHooks-${version}${label}\n\n${body}\n\n---\nJournal complet de toutes les versions : [${file}](https://github.com/${repo}/blob/${branch}/${file})`);
