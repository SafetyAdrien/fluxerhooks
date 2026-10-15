import type { DraftMessage, Embed, EmbedField, EditorState, WebhookTarget } from '../types';

let counter = 0;
export const uid = (): string =>
  `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const newField = (): EmbedField => ({ id: uid(), name: '', value: '', inline: false });

export const newEmbed = (): Embed => ({
  id: uid(),
  title: '',
  url: '',
  description: '',
  color: null,
  timestamp: null,
  author: { name: '', url: '', icon_url: '' },
  thumbnail: { url: '' },
  image: { url: '' },
  footer: { text: '', icon_url: '' },
  fields: [],
});

export const newMessage = (): DraftMessage => ({
  id: uid(),
  collapsed: false,
  content: '',
  username: '',
  avatar_url: '',
  embeds: [],
  attachments: [],
  suppressEmbeds: false,
  suppressNotifications: false,
  mentions: 'none',
  threadMode: 'channel',
  thread_id: '',
  thread_name: '',
  applied_tags: [],
  reference: '',
  reply_to: '',
});

export const newTarget = (url = ''): WebhookTarget => ({ id: uid(), url, enabled: true });

export const welcomeState = (): EditorState => {
  const m = newMessage();
  m.content =
    'Bienvenue sur **FluxerHooks** ! 👋\nCompose tes messages, ajoute des embeds, puis envoie-les sur ton serveur **Fluxer** via un webhook.';
  const e = newEmbed();
  e.title = 'Ton premier embed';
  e.description =
    'Utilise le *markdown* : **gras**, __souligné__, ~~barré~~, `code`, ||spoiler|| et [liens](https://fluxer.app).';
  e.color = 0x4641d9;
  e.fields = [
    { id: uid(), name: 'Champ en ligne', value: 'Valeur 1', inline: true },
    { id: uid(), name: 'Autre champ', value: 'Valeur 2', inline: true },
  ];
  e.footer.text = 'FluxerHooks';
  m.embeds = [e];
  return { targets: [newTarget()], messages: [m] };
};

/** Clone profond avec de nouveaux identifiants (pour « dupliquer »). */
export function cloneMessage(m: DraftMessage): DraftMessage {
  const c: DraftMessage = JSON.parse(JSON.stringify(m));
  c.id = uid();
  c.lastSent = undefined;
  c.reference = '';
  c.embeds = c.embeds.map((e) => ({ ...e, id: uid(), fields: e.fields.map((f) => ({ ...f, id: uid() })) }));
  c.attachments = c.attachments.map((a) => ({ ...a, id: uid() }));
  return c;
}

export function cloneEmbed(e: Embed): Embed {
  const c: Embed = JSON.parse(JSON.stringify(e));
  c.id = uid();
  c.fields = c.fields.map((f) => ({ ...f, id: uid() }));
  return c;
}

export function moveItem<T>(arr: T[], index: number, delta: number): T[] {
  const to = index + delta;
  if (to < 0 || to >= arr.length) return arr;
  const copy = arr.slice();
  const [it] = copy.splice(index, 1);
  copy.splice(to, 0, it);
  return copy;
}
