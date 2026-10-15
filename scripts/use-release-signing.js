// Ajoute une config de signature « release » lisant gradle.properties
// (utilisé par le workflow GitHub Actions quand une clé est fournie).
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'android', 'app', 'build.gradle');
let src = fs.readFileSync(file, 'utf8');
if (!src.includes('FLUXERHOOKS_STORE_FILE')) {
  src = src.replace(
    /signingConfigs\s*\{/,
    `signingConfigs {
        release {
            storeFile file(FLUXERHOOKS_STORE_FILE)
            storePassword FLUXERHOOKS_STORE_PASSWORD
            keyAlias FLUXERHOOKS_KEY_ALIAS
            keyPassword FLUXERHOOKS_KEY_PASSWORD
        }`,
  );
  src = src.replace(
    /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/,
    '$1signingConfig signingConfigs.release',
  );
  fs.writeFileSync(file, src);
  console.log('Signature release configurée.');
}
