// Génère un APK par architecture (beaucoup plus léger à télécharger) + un APK universel.
// Tous gardent le même versionCode : chacun s'installe par-dessus la version précédente.
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'android', 'app', 'build.gradle');
let src = fs.readFileSync(file, 'utf8');
if (!src.includes('universalApk')) {
  src = src.replace(
    /\nandroid\s*\{/,
    `\nandroid {
    splits {
        abi {
            reset()
            enable true
            universalApk true
            include "arm64-v8a", "armeabi-v7a", "x86_64"
        }
    }`,
  );
  if (!src.includes('universalApk')) throw new Error('Bloc android { introuvable dans build.gradle');
  fs.writeFileSync(file, src);
  console.log('Découpage par architecture activé.');
}
