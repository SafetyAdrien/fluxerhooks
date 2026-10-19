/**
 * Fonctionnalités activables. Le bot Fluxer (envoi direct, gateway) est grisé pour l'instant :
 * son code reste en place, il suffira de repasser BOT_ENABLED à true.
 */
export const BOT_ENABLED = false;

/**
 * Date de création de FluxerHooks (premier commit du dépôt). Aucune session du compte Fluxer
 * inactive depuis cette date ne peut concerner l'app : elles ne sont pas affichées dans « Appareils ».
 */
export const APP_CREATED_AT = Date.parse('2026-10-15T22:31:14Z');
