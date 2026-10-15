// Limites documentées par Fluxer (rich embed input / webhook message body).
export const LIMITS = {
  content: 4000, // webhook : max(max_message_length, 4000)
  username: 80,
  avatarUrl: 2048,
  embeds: 10,
  embedTitle: 256,
  embedDescription: 4096,
  fields: 25,
  fieldName: 256,
  fieldValue: 1024,
  footer: 2048,
  authorName: 256,
  url: 2048,
  attachments: 10,
  threadName: 100,
  appliedTags: 5,
  /** Total conseillé (pas une limite stricte Fluxer, mais utile à l'affichage). */
  embedTotal: 6000,
};

export function embedLength(e: {
  title: string;
  description: string;
  footer: { text: string };
  author: { name: string };
  fields: { name: string; value: string }[];
}): number {
  return (
    e.title.length +
    e.description.length +
    e.footer.text.length +
    e.author.name.length +
    e.fields.reduce((n, f) => n + f.name.length + f.value.length, 0)
  );
}
