import React from 'react';
import { tr } from '../i18n';
import { Image, Linking, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DraftMessage, Embed, LocalAttachment, WebhookInfo } from '../types';
import { useSettings } from '../state/settings';
import { useEndpoints } from '../state/useEndpoints';
import { avatarUrl } from '../api/fluxer';
import { Avatar } from './ui';
import { Markdown, MentionContext } from './Markdown';
import { useSession } from '../state/session';
import { formatBytes, formatTime, intToHex, isHttpUrl } from '../utils/parse';
import { isEmbedEmpty, standaloneAttachments } from '../utils/payload';

/** Affiche une image distante si l'URL est valide (ou une pièce jointe locale via attachment://). */
function RemoteImage({
  url,
  attachments,
  style,
}: {
  url: string;
  attachments: LocalAttachment[];
  style: any;
}) {
  let uri = url.trim();
  if (uri.startsWith('attachment://')) {
    const name = uri.slice('attachment://'.length);
    uri = attachments.find((a) => a.name === name)?.uri ?? '';
  } else if (!isHttpUrl(uri)) uri = '';
  if (!uri) return null;
  return <Image source={{ uri }} style={style} resizeMode="cover" />;
}

function EmbedView({ e, attachments }: { e: Embed; attachments: LocalAttachment[] }) {
  const { theme: t } = useSettings();
  const hasThumb = !!e.thumbnail.url.trim();
  // Les champs « inline » se regroupent par lignes de 3 (2 quand il y a une miniature).
  const perRow = hasThumb ? 2 : 3;
  const rows: { inline: boolean; items: Embed['fields'] }[] = [];
  e.fields
    .filter((f) => f.name.trim() || f.value.trim())
    .forEach((f) => {
      const last = rows[rows.length - 1];
      if (f.inline && last && last.inline && last.items.length < perRow) last.items.push(f);
      else rows.push({ inline: f.inline, items: [f] });
    });

  const titleNode = e.title.trim() ? (
    <Pressable disabled={!isHttpUrl(e.url)} onPress={() => Linking.openURL(e.url.trim()).catch(() => {})}>
      <Markdown text={e.title} size={15.5} color={isHttpUrl(e.url) ? t.link : t.text} singleLine bold />
    </Pressable>
  ) : null;

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          backgroundColor: t.embedBg,
          borderRadius: 6,
          overflow: 'hidden',
          maxWidth: t.z(t.msg.embedMaxWidth),
          borderWidth: t.dark ? 0 : 1,
          borderColor: t.border,
        },
        t.css.embed,
      ]}
    >
      <View style={{ width: t.msg.embedBarWidth, backgroundColor: e.color !== null ? intToHex(e.color) : t.border }} />
      <View style={{ flex: 1, padding: 12, gap: 8, minWidth: 0, minHeight: t.z(44) }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
            {!!e.author.name.trim() && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <RemoteImage url={e.author.icon_url} attachments={attachments} style={{ width: 24, height: 24, borderRadius: 12 }} />
                <Text
                  onPress={isHttpUrl(e.author.url) ? () => Linking.openURL(e.author.url.trim()).catch(() => {}) : undefined}
                  style={{ color: t.text, fontWeight: '700', fontSize: t.font(13.5), flexShrink: 1 }}
                >
                  {e.author.name}
                </Text>
              </View>
            )}
            {titleNode}
            {!!e.description.trim() && <Markdown text={e.description} size={14} embed />}
          </View>
          {hasThumb && (
            <RemoteImage url={e.thumbnail.url} attachments={attachments} style={{ width: 76, height: 76, borderRadius: 6 }} />
          )}
        </View>
        {rows.map((r, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
            {r.items.map((f) => (
              <View key={f.id} style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Markdown text={f.name || '​'} size={13.5} singleLine bold />
                <Markdown text={f.value || '​'} size={13.5} color={t.textMuted} embed />
              </View>
            ))}
          </View>
        ))}
        {!!e.image.url.trim() && (
          <RemoteImage
            url={e.image.url}
            attachments={attachments}
            style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 6, backgroundColor: t.surface2 }}
          />
        )}
        {(!!e.footer.text.trim() || !!e.timestamp) && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {!!e.footer.text.trim() && (
              <RemoteImage url={e.footer.icon_url} attachments={attachments} style={{ width: 20, height: 20, borderRadius: 10 }} />
            )}
            <Text style={{ color: t.textMuted, fontSize: t.font(12), flexShrink: 1 }}>
              {[e.footer.text.trim(), e.timestamp ? formatTime(e.timestamp) : ''].filter(Boolean).join(' • ')}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function AttachmentView({ a }: { a: LocalAttachment }) {
  const { theme: t } = useSettings();
  if (a.mimeType.startsWith('image/')) {
    return (
      <View style={{ borderRadius: 8, overflow: 'hidden', maxWidth: 360 }}>
        <Image source={{ uri: a.uri }} style={{ width: '100%', aspectRatio: 4 / 3 }} blurRadius={a.spoiler ? 30 : 0} />
        {a.spoiler && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '800', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
              {tr("SPOILER")}
            </Text>
          </View>
        )}
      </View>
    );
  }
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 12,
        borderRadius: 8,
        backgroundColor: t.embedBg,
        borderWidth: 1,
        borderColor: t.border,
        maxWidth: 400,
      }}
    >
      <Ionicons name="document-attach" size={30} color={t.accent} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: t.link, fontWeight: '600' }}>
          {a.name}
        </Text>
        <Text style={{ color: t.textFaint, fontSize: t.font(12) }}>{formatBytes(a.size)}</Text>
      </View>
    </View>
  );
}

export function MessagePreview({
  m,
  info,
  grouped,
}: {
  m: DraftMessage;
  info?: WebhookInfo;
  grouped?: boolean;
}) {
  const { theme: t, settings } = useSettings();
  const ms = t.msg;
  const ep = useEndpoints();
  const name = (info?.bot ? info.name : m.username.trim() || info?.name) || 'Webhook';
  const avatar = (info?.bot ? null : m.avatar_url.trim()) || (info ? avatarUrl(ep, info.id, info.avatar) : null);
  const compact = settings.previewDisplay === 'compact';
  // Les embeds vides restent visibles dans l'aperçu (carte vide), pour suivre l'édition.
  const embeds = m.suppressEmbeds ? [] : m.embeds;
  // Les fichiers cités par un embed (attachment://) s'affichent dans l'embed, pas sous le message.
  const files = standaloneAttachments(m);
  const empty = !m.content.trim() && !embeds.length && !files.length;
  const av = t.z(ms.avatarSize);
  const padV = ms.spacing === 'tight' ? 4 : ms.spacing === 'airy' ? 14 : 8;

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <Text style={[{ color: t.text, fontWeight: '700', fontSize: t.font(ms.fontSize) }, t.css['message-name']]}>{name}</Text>
      {ms.showBotTag && (
        <View style={{ backgroundColor: t.accent, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          {/* Bot : coche « vérifié » ; webhook : simple « BOT » */}
          {info?.bot && <Ionicons name="checkmark" size={t.z(10)} color={t.onAccent} />}
          <Text style={{ color: t.onAccent, fontSize: t.font(10), fontWeight: '800' }}>{tr("BOT")}</Text>
        </View>
      )}
      {ms.showTimestamps && <Text style={{ color: t.textFaint, fontSize: t.font(12) }}>{formatTime(m.lastSent?.at)}</Text>}
      {!!m.reference.trim() && <Text style={{ color: t.textFaint, fontSize: t.font(11) }}>{tr("(modifié)")}</Text>}
    </View>
  );

  const body = (
    <View
      style={[
        { gap: 6, flex: 1, minWidth: 0 },
        ms.bubbles ? { backgroundColor: t.surface2, borderRadius: t.radius, padding: 10, borderTopLeftRadius: compact ? t.radius : 4 } : null,
      ]}
    >
      {!grouped && !compact && header}
      {!empty && !!m.content.trim() && (
        <View style={t.css['message-text']}>
          <Markdown text={m.content} size={ms.fontSize} color={t.css['message-text']?.color as string | undefined} />
        </View>
      )}
      {files.map((a) => (
        <AttachmentView key={a.id} a={a} />
      ))}
      {embeds.map((e) => (
        <EmbedView key={e.id} e={e} attachments={m.attachments} />
      ))}
    </View>
  );

  return (
    <View style={[{ paddingHorizontal: 14, paddingVertical: grouped ? 2 : padV }, t.css.message]}>
      {!!m.reply_to.trim() && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: compact ? 0 : av / 2, marginBottom: 4 }}>
          <Ionicons name="return-up-forward" size={t.z(14)} color={t.textFaint} />
          <Text style={{ color: t.textFaint, fontSize: t.font(12) }}>{tr("Réponse au message")} {m.reply_to.trim()}</Text>
        </View>
      )}
      {m.threadMode === 'forum_post' && !!m.thread_name.trim() && !grouped && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <Ionicons name="chatbubbles" size={t.z(14)} color={t.accent} />
          <Text style={{ color: t.text, fontWeight: '800', fontSize: t.font(16), flex: 1 }}>{m.thread_name}</Text>
        </View>
      )}
      {compact ? (
        <View style={{ gap: 4 }}>
          {!grouped && header}
          {body}
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ width: av }}>{!grouped && <Avatar uri={avatar} name={name} size={av} shape={ms.avatarShape} />}</View>
          {body}
        </View>
      )}
    </View>
  );
}

export function PreviewList({ messages, info }: { messages: DraftMessage[]; info?: WebhookInfo }) {
  const { theme: t } = useSettings();
  const resolve = useSession().resolve;
  return (
    <MentionContext.Provider value={resolve}>
      <View style={[{ backgroundColor: t.preview, borderRadius: t.radius, paddingVertical: 8, borderWidth: 1, borderColor: t.border }, t.css.preview]}>
        {messages.map((m, i) => {
          const prev = messages[i - 1];
          const same =
            t.msg.groupMessages &&
            !!prev &&
            prev.username.trim() === m.username.trim() &&
            prev.avatar_url.trim() === m.avatar_url.trim() &&
            m.threadMode !== 'forum_post' &&
            !m.reply_to.trim();
          return <MessagePreview key={m.id} m={m} info={info} grouped={same} />;
        })}
      </View>
    </MentionContext.Provider>
  );
}
