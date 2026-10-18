/**
 * Connexion d'appareils : les appareils connectés au même compte Fluxer se lient (QR code ou code),
 * puis synchronisent leurs données directement entre eux sur le réseau local, chiffrées.
 */

/** Port du serveur local de FluxerHooks Desktop. */
export const LINK_PORT = 47321;

/** Clés de stockage synchronisées. Les listes sont fusionnées élément par élément (par `id`). */
export const WHOLE_KEYS: Record<string, string> = {
  'fluxerhooks:editor:v1': 'editor',
  'fluxerhooks:history:v1': 'history',
  'fluxerhooks:settings:v1': 'settings',
  'fluxerhooks:automation-log:v1': 'automation-log',
};
export const LIST_KEYS: Record<string, string> = {
  'fluxerhooks:backups:v1': 'backups',
  'fluxerhooks:templates:v1': 'templates',
  'fluxerhooks:automations:v1': 'automations',
};
export const SYNCED_KEYS = [...Object.keys(WHOLE_KEYS), ...Object.keys(LIST_KEYS)];
export const isSyncedKey = (k: string) => k in WHOLE_KEYS || k in LIST_KEYS;

/** Clés internes (préfixe distinct : jamais synchronisées ni incluses dans les backups). */
export const META = {
  device: 'fluxerhooks-link:device',
  links: 'fluxerhooks-link:links',
  index: 'fluxerhooks-link:index',
  dirty: 'fluxerhooks-link:dirty',
};
