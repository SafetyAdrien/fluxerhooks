import type { DraftMessage, Template } from '../types';
import { newEmbed, newMessage, uid } from '../utils/factory';

const field = (name: string, value: string, inline = false) => ({ id: uid(), name, value, inline });

function msg(build: (m: DraftMessage) => void): DraftMessage {
  const m = newMessage();
  build(m);
  return m;
}

/** Modèles intégrés, prêts à personnaliser. */
export function builtinTemplates(): Template[] {
  return [
    {
      id: 'tpl-rules',
      builtin: true,
      name: 'Règlement du serveur',
      icon: 'shield-checkmark-outline',
      description: 'Règles numérotées avec sanctions',
      messages: [
        msg((m) => {
          const e = newEmbed();
          e.title = '📜 Règlement du serveur';
          e.color = 0x4641d9;
          e.description =
            'Bienvenue ! Merci de lire et respecter ces règles.\n\n**1.** Respect envers tous les membres.\n**2.** Pas de spam ni de publicité.\n**3.** Contenus adaptés à chaque salon.\n**4.** Pas de contenu NSFW hors salons prévus.\n**5.** Suivez les consignes des modérateurs.';
          e.fields = [field('⚠️ Sanctions', 'Avertissement → Mute → Exclusion → Bannissement')];
          e.footer.text = 'En restant sur le serveur, vous acceptez ce règlement.';
          m.embeds = [e];
        }),
      ],
    },
    {
      id: 'tpl-announce',
      builtin: true,
      name: 'Annonce',
      icon: 'megaphone-outline',
      description: 'Annonce avec mention et image',
      messages: [
        msg((m) => {
          m.content = '@everyone';
          m.mentions = 'all';
          const e = newEmbed();
          e.title = '📢 Nouvelle annonce';
          e.description = 'Écris ici le contenu de ton annonce.\n\n> Ajoute une citation pour mettre une info en valeur.';
          e.color = 0xfee75c;
          e.image.url = '';
          e.timestamp = new Date().toISOString();
          m.embeds = [e];
        }),
      ],
    },
    {
      id: 'tpl-welcome',
      builtin: true,
      name: 'Bienvenue',
      icon: 'hand-left-outline',
      description: 'Message d’accueil et salons utiles',
      messages: [
        msg((m) => {
          const e = newEmbed();
          e.title = '👋 Bienvenue sur le serveur !';
          e.description = 'Nous sommes ravis de t’accueillir. Voici par où commencer :';
          e.color = 0x57f287;
          e.fields = [
            field('📜 Règles', 'Lis le salon règlement', true),
            field('🎭 Rôles', 'Choisis tes rôles', true),
            field('💬 Discussion', 'Présente-toi !', true),
          ];
          m.embeds = [e];
        }),
      ],
    },
    {
      id: 'tpl-roles',
      builtin: true,
      name: 'Rôles',
      icon: 'people-outline',
      description: 'Liste des rôles et de leur description',
      messages: [
        msg((m) => {
          const e = newEmbed();
          e.title = '🎭 Rôles du serveur';
          e.color = 0xeb459e;
          e.fields = [
            field('🛡️ Modération', 'Veille au respect des règles'),
            field('🎨 Créatif', 'Partage tes créations'),
            field('🎮 Joueur', 'Accès aux salons de jeu'),
          ];
          m.embeds = [e];
        }),
      ],
    },
    {
      id: 'tpl-changelog',
      builtin: true,
      name: 'Changelog',
      icon: 'git-commit-outline',
      description: 'Notes de mise à jour par catégorie',
      messages: [
        msg((m) => {
          const e = newEmbed();
          e.title = '🚀 Mise à jour v1.0.0';
          e.color = 0x5865f2;
          e.fields = [
            field('✨ Nouveautés', '- Fonctionnalité A\n- Fonctionnalité B'),
            field('🐛 Corrections', '- Correction X\n- Correction Y'),
            field('🔧 Améliorations', '- Performance\n- Interface'),
          ];
          e.timestamp = new Date().toISOString();
          m.embeds = [e];
        }),
      ],
    },
    {
      id: 'tpl-event',
      builtin: true,
      name: 'Événement',
      icon: 'calendar-outline',
      description: 'Date, lieu et inscription',
      messages: [
        msg((m) => {
          const e = newEmbed();
          const ts = Math.floor(Date.now() / 1000) + 7 * 86400;
          e.title = '🎉 Soirée communautaire';
          e.description = 'Rejoins-nous pour une soirée jeux et discussions !';
          e.color = 0xf47b67;
          e.fields = [field('📅 Date', `<t:${ts}:F>`, true), field('⏳ Dans', `<t:${ts}:R>`, true), field('📍 Lieu', 'Salon vocal Événements', true)];
          m.embeds = [e];
        }),
      ],
    },
    {
      id: 'tpl-poll',
      builtin: true,
      name: 'Sondage',
      icon: 'stats-chart-outline',
      description: 'Question et choix à réactions',
      messages: [
        msg((m) => {
          const e = newEmbed();
          e.title = '📊 Sondage';
          e.description = '**Quelle est ta question ?**\n\n🅰️ Premier choix\n🅱️ Deuxième choix\n🇨 Troisième choix';
          e.color = 0x1abc9c;
          e.footer.text = 'Réagis avec l’émoji correspondant pour voter.';
          m.embeds = [e];
        }),
      ],
    },
    {
      id: 'tpl-maintenance',
      builtin: true,
      name: 'Maintenance',
      icon: 'construct-outline',
      description: 'Statut d’un service',
      messages: [
        msg((m) => {
          const e = newEmbed();
          e.title = '🛠️ Maintenance programmée';
          e.description = 'Le service sera indisponible pendant la maintenance.';
          e.color = 0xed4245;
          e.fields = [field('Début', '<t:0:f>', true), field('Durée estimée', '1 h', true)];
          m.embeds = [e];
        }),
      ],
    },
  ];
}
