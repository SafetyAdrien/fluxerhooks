import React, { useState } from 'react';
import { Linking, Platform, Pressable, Text, View, type TextStyle } from 'react-native';
import { useTheme, type Theme } from '../state/settings';

/**
 * Rendu markdown façon Fluxer/Discord pour l'aperçu :
 * gras, italique, souligné, barré, code, blocs de code, spoilers, liens,
 * titres (#, ##, ###), sous-texte (-#), citations, listes, mentions et horodatages <t:…>.
 */

type Node = React.ReactNode;
const mono = Platform.OS === 'android' ? 'monospace' : 'Menlo';

interface InlineRule {
  re: RegExp;
  render: (m: RegExpExecArray, ctx: Ctx, key: string) => Node;
}

interface Ctx {
  t: Theme;
  base: TextStyle;
  embed?: boolean;
  resolve?: MentionResolver;
}

export type MentionResolver = (kind: 'channel' | 'role' | 'user' | 'emoji', id: string) => string | undefined;
/** Fournit les noms connus (#salon, @rôle…) à l'aperçu. */
export const MentionContext = React.createContext<MentionResolver | undefined>(undefined);

function Spoiler({ children, t }: { children: Node; t: Theme }) {
  const [open, setOpen] = useState(false);
  return (
    <Text
      onPress={() => setOpen(true)}
      style={{ backgroundColor: open ? 'rgba(128,128,128,0.25)' : t.dark ? '#111' : '#ccc', color: open ? undefined : 'transparent', borderRadius: 3 }}
    >
      {children}
    </Text>
  );
}

function formatUnix(unix: number, style: string): string {
  const d = new Date(unix * 1000);
  if (isNaN(d.getTime())) return String(unix);
  switch (style) {
    case 't':
      return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    case 'T':
      return d.toLocaleTimeString('fr-FR');
    case 'd':
      return d.toLocaleDateString('fr-FR');
    case 'D':
      return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    case 'F':
      return d.toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    case 'R': {
      const diff = Math.round((unix * 1000 - Date.now()) / 1000);
      const abs = Math.abs(diff);
      const unit = abs < 60 ? ['seconde', 1] : abs < 3600 ? ['minute', 60] : abs < 86400 ? ['heure', 3600] : abs < 2592000 ? ['jour', 86400] : abs < 31536000 ? ['mois', 2592000] : ['an', 31536000];
      const n = Math.round(abs / (unit[1] as number));
      const label = `${n} ${unit[0]}${n > 1 && unit[0] !== 'mois' ? 's' : ''}`;
      return diff >= 0 ? `dans ${label}` : `il y a ${label}`;
    }
    default:
      return d.toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
}

const mention = (ctx: Ctx, label: string, key: string) => (
  <Text key={key} style={{ backgroundColor: ctx.t.mentionBg, color: ctx.t.mentionText, fontWeight: '600', borderRadius: 3 }}>
    {label}
  </Text>
);

const RULES: InlineRule[] = [
  { re: /^\\([*_~`|\\<>#\[\]()-])/, render: (m) => m[1] },
  {
    re: /^`([^`]+)`/,
    render: (m, c, k) => (
      <Text key={k} style={{ fontFamily: mono, backgroundColor: c.t.codeBg, fontSize: (c.base.fontSize ?? 15) * 0.88 }}>
        {m[1]}
      </Text>
    ),
  },
  { re: /^\|\|([\s\S]+?)\|\|/, render: (m, c, k) => <Spoiler key={k} t={c.t}>{inline(m[1], c)}</Spoiler> },
  {
    re: /^\[([^\]]+)\]\((<)?(https?:\/\/[^\s)>]+)>?(?:\s+"[^"]*")?\)/,
    render: (m, c, k) => (
      <Text key={k} style={{ color: c.t.link }} onPress={() => Linking.openURL(m[3]).catch(() => {})}>
        {inline(m[1], c)}
      </Text>
    ),
  },
  {
    re: /^<?(https?:\/\/[^\s<>]+[^\s<>.,:;"')\]])>?/,
    render: (m, c, k) => (
      <Text key={k} style={{ color: c.t.link }} onPress={() => Linking.openURL(m[1]).catch(() => {})}>
        {m[1]}
      </Text>
    ),
  },
  { re: /^\*\*\*([\s\S]+?)\*\*\*/, render: (m, c, k) => <Text key={k} style={{ fontWeight: '700', fontStyle: 'italic' }}>{inline(m[1], c)}</Text> },
  { re: /^\*\*([\s\S]+?)\*\*/, render: (m, c, k) => <Text key={k} style={{ fontWeight: '700' }}>{inline(m[1], c)}</Text> },
  { re: /^__([\s\S]+?)__/, render: (m, c, k) => <Text key={k} style={{ textDecorationLine: 'underline' }}>{inline(m[1], c)}</Text> },
  { re: /^\*(?!\s)([\s\S]+?)\*(?!\*)/, render: (m, c, k) => <Text key={k} style={{ fontStyle: 'italic' }}>{inline(m[1], c)}</Text> },
  { re: /^_(?!\s)([\s\S]+?)_(?!\w)/, render: (m, c, k) => <Text key={k} style={{ fontStyle: 'italic' }}>{inline(m[1], c)}</Text> },
  { re: /^~~([\s\S]+?)~~/, render: (m, c, k) => <Text key={k} style={{ textDecorationLine: 'line-through' }}>{inline(m[1], c)}</Text> },
  { re: /^<@!?(\d+)>/, render: (m, c, k) => mention(c, `@${c.resolve?.('user', m[1]) ?? 'utilisateur'}`, k) },
  { re: /^<@&(\d+)>/, render: (m, c, k) => mention(c, `@${c.resolve?.('role', m[1]) ?? 'rôle'}`, k) },
  { re: /^<#(\d+)>/, render: (m, c, k) => mention(c, `#${c.resolve?.('channel', m[1]) ?? 'salon'}`, k) },
  { re: /^<id:(customize|browse|guide)>/, render: (m, c, k) => mention(c, m[1] === 'browse' ? '#Parcourir les salons' : m[1] === 'guide' ? '#Guide du serveur' : '#Salons et rôles', k) },
  { re: /^@(everyone|here)\b/, render: (m, c, k) => mention(c, `@${m[1]}`, k) },
  { re: /^<a?:(\w+):(\d+)>/, render: (m, c, k) => <Text key={k} style={{ color: c.t.textMuted }}>:{m[1]}:</Text> },
  {
    re: /^<t:(-?\d+)(?::([tTdDfFR]))?>/,
    render: (m, c, k) => (
      <Text key={k} style={{ backgroundColor: c.t.codeBg, borderRadius: 3 }}>
        {formatUnix(Number(m[1]), m[2] || 'f')}
      </Text>
    ),
  },
];

const SPECIAL = /[\\`|\[h<*_~@]/;

export function inline(text: string, ctx: Ctx): Node[] {
  const out: Node[] = [];
  let buf = '';
  let i = 0;
  let k = 0;
  while (i < text.length) {
    const ch = text[i];
    if (SPECIAL.test(ch)) {
      const rest = text.slice(i);
      let matched = false;
      for (const r of RULES) {
        const m = r.re.exec(rest);
        if (m) {
          if (buf) {
            out.push(buf);
            buf = '';
          }
          out.push(r.render(m, ctx, `i${k++}`));
          i += m[0].length;
          matched = true;
          break;
        }
      }
      if (matched) continue;
    }
    buf += ch;
    i++;
  }
  if (buf) out.push(buf);
  return out;
}

interface Block {
  kind: 'p' | 'h1' | 'h2' | 'h3' | 'sub' | 'quote' | 'code' | 'li';
  text: string;
  lang?: string;
  ordered?: string;
  depth?: number;
}

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: 'p', text: para.join('\n') });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^```(\w*)\s*(.*)$/);
    if (fence) {
      flush();
      const body: string[] = [];
      // ```code``` sur une seule ligne
      if (fence[2] && fence[2].endsWith('```')) {
        blocks.push({ kind: 'code', text: (fence[1] + ' ' + fence[2]).slice(0, -3).trim() });
        continue;
      }
      if (fence[2]) body.push(fence[2]);
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++]);
      blocks.push({ kind: 'code', text: body.join('\n'), lang: fence[1] });
      continue;
    }
    if (line.startsWith('>>> ')) {
      flush();
      blocks.push({ kind: 'quote', text: [line.slice(4), ...lines.slice(i + 1)].join('\n') });
      break;
    }
    const q = line.match(/^> ?(.*)$/);
    if (q && line.startsWith('>')) {
      flush();
      const last = blocks[blocks.length - 1];
      if (last && last.kind === 'quote') last.text += '\n' + q[1];
      else blocks.push({ kind: 'quote', text: q[1] });
      continue;
    }
    const h = line.match(/^(#{1,3}) (.+)$/);
    if (h) {
      flush();
      blocks.push({ kind: (['h1', 'h2', 'h3'] as const)[h[1].length - 1], text: h[2] });
      continue;
    }
    const sub = line.match(/^-# (.+)$/);
    if (sub) {
      flush();
      blocks.push({ kind: 'sub', text: sub[1] });
      continue;
    }
    const li = line.match(/^(\s*)([-*]|\d+\.) (.+)$/);
    if (li) {
      flush();
      blocks.push({
        kind: 'li',
        text: li[3],
        ordered: /\d/.test(li[2]) ? li[2] : undefined,
        depth: Math.min(2, Math.floor(li[1].length / 2)),
      });
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks;
}

export function Markdown({
  text,
  size = 15,
  color,
  embed,
  singleLine,
  bold,
}: {
  bold?: boolean;
  text: string;
  size?: number;
  color?: string;
  embed?: boolean;
  singleLine?: boolean;
}) {
  const t = useTheme();
  const resolve = React.useContext(MentionContext);
  const fs = t.font(size);
  const base: TextStyle = { color: color ?? t.text, fontSize: fs, lineHeight: fs * 1.38, fontWeight: bold ? '700' : undefined };
  const ctx: Ctx = { t, base, embed, resolve };
  if (singleLine) return <Text style={base}>{inline(text, ctx)}</Text>;
  const blocks = parseBlocks(text);
  return (
    <View style={{ gap: 2 }}>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'h1':
          case 'h2':
          case 'h3': {
            const s = fs * (b.kind === 'h1' ? 1.5 : b.kind === 'h2' ? 1.28 : 1.12);
            return (
              <Text key={i} style={{ ...base, fontSize: s, lineHeight: s * 1.3, fontWeight: '800', marginTop: 4 }}>
                {inline(b.text, ctx)}
              </Text>
            );
          }
          case 'sub':
            return (
              <Text key={i} style={{ ...base, fontSize: fs * 0.8, color: t.textMuted }}>
                {inline(b.text, ctx)}
              </Text>
            );
          case 'quote':
            return (
              <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ width: 4, borderRadius: 2, backgroundColor: t.textFaint }} />
                <View style={{ flex: 1 }}>
                  <Markdown text={b.text} size={size} color={color} embed={embed} />
                </View>
              </View>
            );
          case 'code':
            return (
              <View key={i} style={{ backgroundColor: t.codeBg, borderRadius: 6, padding: 10, borderWidth: 1, borderColor: t.border, marginVertical: 2 }}>
                <Text selectable style={{ fontFamily: mono, color: t.text, fontSize: fs * 0.86, lineHeight: fs * 1.25 }}>
                  {b.text}
                </Text>
              </View>
            );
          case 'li':
            return (
              <View key={i} style={{ flexDirection: 'row', paddingLeft: 4 + (b.depth ?? 0) * 16, gap: 6 }}>
                <Text style={base}>{b.ordered ?? '•'}</Text>
                <Text style={[base, { flex: 1 }]}>{inline(b.text, ctx)}</Text>
              </View>
            );
          default:
            return (
              <Text key={i} style={base}>
                {inline(b.text, ctx)}
              </Text>
            );
        }
      })}
    </View>
  );
}

/** Petite aide visuelle pour la barre d'outils markdown. */
export function MarkdownLink({ url, children }: { url: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Pressable onPress={() => Linking.openURL(url).catch(() => {})}>
      <Text style={{ color: t.link }}>{children}</Text>
    </Pressable>
  );
}
