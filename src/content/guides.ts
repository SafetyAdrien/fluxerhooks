/**
 * Guides (panneau du profil) : ce que l'on peut faire avec les messages FluxerHooks, et comment
 * bien les rédiger. Les textes français servent de clés de traduction (voir src/i18n).
 * Exemples : texte markdown affiché brut + rendu, copiable et ajoutable au brouillon.
 * Modèles : renvoient vers un modèle intégré (src/state/templates.ts).
 */
export type GuideBlock =
  | { type: 'p'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'example'; code: string; label?: string }
  | { type: 'templates'; ids: string[] };

export interface Guide {
  id: string;
  icon: string;
  title: string;
  summary: string;
  blocks: GuideBlock[];
}

export const GUIDES: Guide[] = [
  {
    id: 'start',
    icon: 'rocket-launch-outline',
    title: 'Bien démarrer',
    summary: 'Destinations, envoi et aperçu.',
    blocks: [
      { type: 'p', text: 'FluxerHooks prépare des messages riches et les envoie dans tes salons Fluxer grâce aux webhooks.' },
      {
        type: 'list',
        items: [
          'Crée un webhook dans les paramètres du salon Fluxer, puis colle son URL dans « Webhooks » : il est vérifié tout de suite.',
          'Ajoute plusieurs webhooks pour envoyer le même message dans plusieurs salons ; désactive-en un sans le supprimer.',
          'Le bouton d’envoi, en haut à droite, envoie tous les messages du brouillon, dans l’ordre, vers toutes les destinations actives.',
          'L’aperçu montre le rendu approximatif ; sur tablette ou en paysage, il s’affiche à côté de l’éditeur.',
        ],
      },
    ],
  },
  {
    id: 'markdown',
    icon: 'format-text',
    title: 'Mettre en forme le texte',
    summary: 'Gras, titres, listes, citations, spoilers…',
    blocks: [
      { type: 'p', text: 'Le contenu d’un message accepte jusqu’à 4 000 caractères et la syntaxe markdown de Fluxer.' },
      { type: 'example', label: 'Styles', code: '**gras**  *italique*  __souligné__  ~~barré~~\n||spoiler||  `code`' },
      { type: 'example', label: 'Titres et sous-texte', code: '# Grand titre\n## Titre moyen\n### Petit titre\n-# Petit texte discret' },
      { type: 'example', label: 'Listes et citations', code: '- Premier point\n- Deuxième point\n> Une citation\n> sur deux lignes' },
      { type: 'example', label: 'Liens', code: 'Lis le [règlement](https://fluxer.app) avant de poster.' },
      { type: 'example', label: 'Bloc de code', code: '```\nnpm run build\n```' },
    ],
  },
  {
    id: 'mentions',
    icon: 'at',
    title: 'Mentions et dates dynamiques',
    summary: 'Membres, rôles, salons et horodatages.',
    blocks: [
      {
        type: 'list',
        items: [
          'Tape @ dans le contenu pour choisir un membre, un rôle ou un salon de ton serveur.',
          'Syntaxe : <@ID> pour un membre, <@&ID> pour un rôle, <#ID> pour un salon.',
          'Dans Options, « Mentions autorisées » décide qui reçoit vraiment une notification : aucune, membres, membres et rôles, ou toutes (@everyone compris).',
          '« Message silencieux » envoie sans notifier personne.',
        ],
      },
      { type: 'p', text: 'Un horodatage s’affiche dans le fuseau et la langue de chaque lecteur. Le nombre est un temps Unix en secondes ; la lettre choisit le format.' },
      { type: 'example', label: 'Horodatages', code: 'Début <t:1767225600:R>\nLe <t:1767225600:F>\nDate courte : <t:1767225600:d> · Heure : <t:1767225600:t>' },
    ],
  },
  {
    id: 'embeds',
    icon: 'card-text-outline',
    title: 'Créer des embeds',
    summary: 'Cartes avec titre, couleur, champs et images.',
    blocks: [
      { type: 'p', text: 'Un embed est une carte colorée sous le message. Chaque message peut en contenir jusqu’à 10.' },
      {
        type: 'list',
        items: [
          'Auteur : nom, lien et icône en haut de la carte.',
          'Corps : titre (256 caractères, cliquable avec un lien), description (4 096), couleur de la barre.',
          'Champs : jusqu’à 25, nom (256) et valeur (1 024) ; « en ligne » les place côte à côte.',
          'Images : une grande image et une miniature, par URL ou depuis tes fichiers (attachment://).',
          'Pied de page : texte (2 048), icône et horodatage.',
          'Garde le total d’un embed sous 6 000 caractères : le compteur l’indique.',
        ],
      },
    ],
  },
  {
    id: 'profile',
    icon: 'account-edit-outline',
    title: 'Nom, avatar et fichiers',
    summary: 'Personnaliser l’expéditeur et joindre des fichiers.',
    blocks: [
      {
        type: 'list',
        items: [
          'Dans « Profil », change le nom affiché (80 caractères) et l’avatar pour ce message seulement.',
          'Joins jusqu’à 10 fichiers par message ; marque-les comme spoiler si besoin.',
          'Un fichier joint peut servir d’image d’embed : copie sa référence attachment:// et colle-la dans l’embed.',
        ],
      },
    ],
  },
  {
    id: 'threads',
    icon: 'forum-outline',
    title: 'Threads et forums',
    summary: 'Poster dans un fil ou créer un post de forum.',
    blocks: [
      {
        type: 'list',
        items: [
          'Destination « Thread » : colle l’ID d’un fil ou d’un post existant pour y répondre.',
          'Pour un salon forum, crée un nouveau post : titre de 100 caractères maximum et jusqu’à 5 tags.',
          '« Répondre au message » (Options) cite un message du même salon grâce à son ID.',
        ],
      },
    ],
  },
  {
    id: 'edit',
    icon: 'pencil-box-outline',
    title: 'Modifier un message déjà envoyé',
    summary: 'Corriger ou mettre à jour sans renvoyer.',
    blocks: [
      {
        type: 'list',
        items: [
          'Ouvre « Modifier un message envoyé » et colle le lien ou l’ID du message (envoyé par ce webhook).',
          '« Charger le contenu » récupère le message tel qu’il est sur Fluxer pour le retoucher.',
          'Le bouton d’envoi devient « Envoyer et mettre à jour » : le message est modifié à sa place.',
          '« Supprimer sur Fluxer » le retire du salon ; « Quitter l’édition » revient à un nouvel envoi.',
        ],
      },
    ],
  },
  {
    id: 'writing',
    icon: 'lead-pencil',
    title: 'Bien rédiger',
    summary: 'Conseils pour des messages clairs et lisibles.',
    blocks: [
      {
        type: 'list',
        items: [
          'Une idée par message : découpe un long texte en plusieurs messages ou en champs d’embed.',
          'Mets l’essentiel en premier (titre ou première ligne), les détails ensuite.',
          'Utilise les champs pour les informations courtes : date, lieu, lien, prix.',
          'Garde une couleur d’embed par type de message (annonce, alerte, événement) : on les reconnaît d’un coup d’œil.',
          'Préfère les horodatages <t:…:R> aux heures écrites à la main : chacun voit son fuseau.',
          'Mentionne seulement si c’est utile, et règle « Mentions autorisées » en conséquence.',
          'Vérifie l’aperçu, puis enregistre le résultat comme modèle pour le réutiliser.',
        ],
      },
      { type: 'example', label: 'Annonce courte', code: '## 🚀 Mise à jour disponible\nLa version **2.0** arrive <t:1767225600:R>.\n- Nouveau tableau de bord\n- Corrections de bugs\n-# Plus de détails dans #annonces' },
      { type: 'p', text: 'Pars d’un modèle prêt à l’emploi :' },
      { type: 'templates', ids: ['tpl-announce', 'tpl-rules', 'tpl-welcome', 'tpl-event', 'tpl-changelog', 'tpl-roles', 'tpl-poll', 'tpl-maintenance'] },
    ],
  },
  {
    id: 'library',
    icon: 'archive-outline',
    title: 'Sauvegardes, modèles et dossiers',
    summary: 'Ranger et retrouver tes messages.',
    blocks: [
      {
        type: 'list',
        items: [
          'Ouvre « Données » en touchant « Éditeur » en haut de l’éditeur.',
          'Une sauvegarde garde tout le brouillon (messages et webhooks) ; un modèle garde les messages seulement.',
          'Range-les dans des dossiers colorés, ajoute des étiquettes et épingle les plus utilisés.',
          'Recherche dans les noms, les étiquettes et même le texte des messages ; trie par date, nom ou taille.',
          'Sélectionne plusieurs éléments (appui long) pour les déplacer, étiqueter, exporter ou supprimer ensemble.',
          'Exporte ta bibliothèque dans un fichier, ou importe un JSON de message (FluxerHooks ou Discohook).',
        ],
      },
    ],
  },
  {
    id: 'automations',
    icon: 'timer-outline',
    title: 'Automatisations',
    summary: 'Programmer des envois.',
    blocks: [
      {
        type: 'list',
        items: [
          'Programme une sauvegarde ou un modèle : une fois, chaque jour, chaque semaine ou à intervalle (15 minutes minimum).',
          'Depuis Données, « Programmer un envoi » prépare l’automatisation avec l’élément choisi.',
          'Les envois partent de cet appareil ; sur téléphone, Android vérifie environ toutes les 15 minutes.',
        ],
      },
      { type: 'p', text: 'Variables remplacées à chaque envoi :' },
      { type: 'example', label: 'Variables', code: 'Rapport n°{compteur} du {jour} {date} à {heure}\nPublié {timestamp}' },
    ],
  },
  {
    id: 'history',
    icon: 'history',
    title: 'Historique et appareils',
    summary: 'Annuler, revenir en arrière, synchroniser.',
    blocks: [
      {
        type: 'list',
        items: [
          'Les boutons en bas à gauche de l’éditeur annulent ou rétablissent une modification.',
          'La chronologie garde chaque étape, même après une annulation : touche une étape pour y revenir.',
          'Le JSON (bouton </>) importe ou exporte le brouillon, compatible Discohook.',
          'Paramètres → Appareils relie tes appareils du même compte : sauvegardes, modèles, dossiers et historique se synchronisent en direct sur le même Wi-Fi.',
        ],
      },
    ],
  },
];
