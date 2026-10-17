// Applique le nommage « FluxerHooks-beta<N> » à un état du code (utilisé pour reconstruire les anciennes versions).
// Usage : node beta-label.js <N> [dossier]
const fs = require('fs');
const path = require('path');
const n = process.argv[2];
const root = process.argv[3] || '.';
if (!/^\d+$/.test(n || '')) throw new Error('Numéro de beta attendu');
const appPath = path.join(root, 'app.json');
const app = JSON.parse(fs.readFileSync(appPath, 'utf8'));
app.expo.version = `beta${n}`;
fs.writeFileSync(appPath, JSON.stringify(app, null, 2) + '\n');
const rules = [
  [/\{tr\("FluxerHooks"\)\} \{Constants\.expoConfig\?\.version \?\? ''\}/g, "FluxerHooks-{Constants.expoConfig?.version ?? ''}"],
  [/FluxerHooks \{Constants\.expoConfig\?\.version \?\? ''\}/g, "FluxerHooks-{Constants.expoConfig?.version ?? ''}"],
  [/FluxerHooks \{version\}/g, 'FluxerHooks-{version}'],
];
let hits = 0;
for (const f of ['src/screens/SettingsSheet.tsx', 'src/screens/LandingPage.tsx']) {
  const p = path.join(root, f);
  if (!fs.existsSync(p)) continue;
  let s = fs.readFileSync(p, 'utf8');
  for (const [re, to] of rules) s = s.replace(re, () => (hits++, to));
  fs.writeFileSync(p, s);
}
console.log(`beta${n} : version = ${app.expo.version}, versionCode = ${app.expo.android?.versionCode}, ${hits} libellé(s) modifié(s)`);
if (!hits) process.exit(1);
