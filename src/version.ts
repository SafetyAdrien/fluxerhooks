import app from '../app.json';

/** Nom de la version affiché dans l'app (« beta15 »), lu dans app.json pour être identique sur Android et sur le web. */
export const APP_VERSION: string = app.expo.version;
