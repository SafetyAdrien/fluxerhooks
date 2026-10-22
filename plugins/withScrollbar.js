// Barre de défilement Android assortie à l'app : fine, arrondie, gris translucide (lisible sur
// les thèmes clairs et sombres). Ajoute un drawable et l'applique au thème de l'application.
const { withAndroidStyles, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const DRAWABLE = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
  <solid android:color="#888F9AA8" />
  <corners android:radius="4dp" />
  <size android:width="4dp" />
</shape>
`;

module.exports = function withScrollbar(config) {
  config = withDangerousMod(config, [
    'android',
    async (c) => {
      const dir = path.join(c.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'drawable');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'fh_scrollbar_thumb.xml'), DRAWABLE);
      return c;
    },
  ]);
  return withAndroidStyles(config, (c) => {
    const styles = c.modResults.resources.style ?? [];
    const app = styles.find((s) => s.$?.name === 'AppTheme');
    if (app) {
      app.item = (app.item ?? []).filter((i) => !['android:scrollbarThumbVertical', 'android:scrollbarThumbHorizontal', 'android:scrollbarSize'].includes(i.$.name));
      app.item.push({ $: { name: 'android:scrollbarThumbVertical' }, _: '@drawable/fh_scrollbar_thumb' });
      app.item.push({ $: { name: 'android:scrollbarThumbHorizontal' }, _: '@drawable/fh_scrollbar_thumb' });
      app.item.push({ $: { name: 'android:scrollbarSize' }, _: '4dp' });
    }
    return c;
  });
};
