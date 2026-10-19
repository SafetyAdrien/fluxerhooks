import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Platform, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import * as Clipboard from 'expo-clipboard';
import qrcode from 'qrcode-generator';
import { currentLocale, tr } from '../i18n';
import { listAuthSessions, type AuthSession } from '../api/fluxer';
import { APP_CREATED_AT } from '../config';
import { useSettings } from '../state/settings';
import { useSession } from '../state/session';
import { useEndpoints } from '../state/useEndpoints';
import { Badge, Box, Button, Dialog, IconBtn, Input, ListRow, SectionLabel, Stack, useToast } from '../components/ui';
import { Alert } from 'react-native';
import { canHost, deviceName } from './transport';
import {
  currentAccount,
  getLinks,
  initLinkServer,
  pairWithCode,
  removeLink,
  setAccount,
  setSessionId,
  startPairing,
  statusOf,
  stopPairing,
  subscribe,
  syncAll,
  type Link,
  type StartMode,
} from './engine';

/* ---------- Sessions du compte Fluxer (appareils connectés) ---------- */

let sessionsCache: { token: string; list: AuthSession[] } | null = null;
const sessionListeners = new Set<() => void>();

/** Charge les sessions du compte et mémorise celle de cet appareil (échangée avec les appareils liés). */
async function refreshSessions(api: string, token: string) {
  const list = await listAuthSessions({ api } as any, token);
  sessionsCache = { token, list };
  setSessionId(list.find((s) => s.current)?.id_hash ?? null);
  sessionListeners.forEach((l) => l());
  return list;
}

/* ---------- Pont avec la session (monté sous SessionProvider) ---------- */

export function LinkBridge() {
  const { userToken } = useSettings();
  const { user } = useSession();
  const ep = useEndpoints();
  useEffect(() => {
    initLinkServer().catch(() => {});
  }, []);
  useEffect(() => {
    if (!userToken) {
      setAccount(null);
      setSessionId(null);
      sessionsCache = null;
      return;
    }
    // Compte connu avec certitude seulement quand le profil a répondu pour ce token.
    if (!user?.id) return;
    setAccount(user.id);
    refreshSessions(ep.api, userToken).catch(() => {});
  }, [userToken, user?.id, ep.api]);
  useEffect(() => {
    const id = setInterval(() => AppState.currentState === 'active' && syncAll(), 20_000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && syncAll());
    const onFocus = () => syncAll();
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(id);
      sub.remove();
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.removeEventListener('focus', onFocus);
    };
  }, []);
  return null;
}

function useLinks() {
  const [links, setLinks] = useState<Link[]>([]);
  const [, bump] = useState(0);
  useEffect(() => {
    const refresh = () => {
      getLinks().then((l) => setLinks([...l]));
      bump((n) => n + 1);
    };
    refresh();
    return subscribe(refresh);
  }, []);
  return links;
}

/* ---------- QR code ---------- */

function QrCode({ value, size }: { value: string; size: number }) {
  const { path, count } = useMemo(() => {
    const qr = qrcode(0, 'L');
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`;
    return { path: d, count: n + 4 };
  }, [value]);
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${count} ${count}`}>
      <Rect x={0} y={0} width={count} height={count} fill="#FFFFFF" />
      <Path d={path} fill="#000000" />
    </Svg>
  );
}

/* ---------- Scanner (Android) ---------- */

function Scanner({ onCode }: { onCode: (code: string) => void }) {
  const { theme: t } = useSettings();
  // Chargé seulement sur Android : le module caméra n'a pas de rôle sur le bureau.
  const Cam = useMemo(() => (Platform.OS === 'web' ? null : require('expo-camera')), []);
  const [perm, request] = Cam ? Cam.useCameraPermissions() : [null, async () => null];
  const [done, setDone] = useState(false);
  if (!Cam) return null;
  if (!perm?.granted) {
    return (
      <Stack>
        <Text style={{ color: t.textMuted, fontSize: t.font(13) }}>{tr('Autorise l’appareil photo pour scanner le QR code affiché sur l’autre appareil.')}</Text>
        <Button variant="primary" icon="camera-outline" label="Autoriser l’appareil photo" onPress={() => request()} />
      </Stack>
    );
  }
  const CameraView = Cam.CameraView;
  return (
    <View style={{ width: '100%', aspectRatio: 1, borderRadius: t.radius, overflow: 'hidden', backgroundColor: '#000' }}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={
          done
            ? undefined
            : (e: { data: string }) => {
                if (!/^FHLINK1\./.test(e.data ?? '')) return;
                setDone(true);
                onCode(e.data);
              }
        }
      />
    </View>
  );
}

/* ---------- Section « Appareils » ---------- */

const ago = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60_000);
  if (mins < 2) return tr('actif à l’instant');
  if (mins < 60) return tr('actif il y a {n} min', { n: mins });
  if (mins < 48 * 60) return tr('actif il y a {n} h', { n: Math.round(mins / 60) });
  return tr('actif le {d}', { d: d.toLocaleDateString(currentLocale()) });
};

function statusLine(l: Link) {
  const s = statusOf(l.peerId);
  if (currentAccount() && l.accountId !== currentAccount()) return tr('Connecté à un autre compte Fluxer');
  const time = (ms?: number) => (ms ? new Date(ms).toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' }) : '');
  switch (s.state) {
    case 'syncing':
      return tr('Synchronisation…');
    case 'live':
      return tr('Connecté en direct · synchronisé à {h}', { h: time(l.lastSync ?? s.at) });
    case 'ok':
      return tr('Synchronisé à {h}', { h: time(l.lastSync ?? s.at) });
    case 'offline':
      return tr('Introuvable sur le réseau (même Wi-Fi requis)');
    case 'other-account':
      return tr('Connecté à un autre compte Fluxer');
    case 'error':
      return `${tr('Erreur')} : ${tr(s.error ?? '')}`;
    default:
      return l.lastSync ? tr('Synchronisé à {h}', { h: time(l.lastSync) }) : tr('En attente…');
  }
}

/**
 * Liste unique et réelle des appareils du compte :
 * - seules les sessions Fluxer actives depuis la création de FluxerHooks sont prises en compte ;
 * - cet appareil et les appareils liés sont reconnus par leur session (échangée à la liaison) ;
 * - les sessions identiques (même type, système, client et lieu) sont regroupées : une reconnexion
 *   crée une nouvelle session pour le même appareil, sans en faire un appareil de plus.
 */
interface DeviceRow {
  key: string;
  kind: 'this' | 'linked' | 'other';
  title: string;
  subtitle: string;
  mobile: boolean;
  link?: Link;
}

const signature = (s: AuthSession) => {
  const c = s.client_info ?? {};
  return [c.device, c.platform, c.os, c.browser, c.location?.city, c.location?.region, c.location?.country].map((x) => String(x ?? '').toLowerCase()).join('|');
};
const isMobile = (s?: AuthSession, platform?: string) =>
  platform === 'android' || platform === 'ios' || (!!s && (s.client_info?.device === 'mobile' || /android|ios|iphone/i.test(`${s.client_info?.os ?? ''} ${s.client_info?.platform ?? ''}`)));
const lastUsed = (s: AuthSession) => (s.approx_last_used_at ? Date.parse(s.approx_last_used_at) : 0);

function sessionLine(s: AuthSession | undefined, count: number) {
  if (!s) return '';
  const c = s.client_info ?? {};
  const label = [c.platform || c.os, c.browser].filter(Boolean).join(' · ');
  const place = [c.location?.city, c.location?.country].filter(Boolean).join(', ');
  return [label, c.os && c.os !== label && c.os !== c.platform ? c.os : '', place, ago(s.approx_last_used_at), count > 1 ? tr('{n} sessions', { n: count }) : '']
    .filter(Boolean)
    .join(' · ');
}

function deviceRows(all: AuthSession[], links: Link[]): DeviceRow[] {
  const sessions = all.filter((s) => s.current || lastUsed(s) >= APP_CREATED_AT);
  const used = new Set<string>();
  // Groupes ancrés : cet appareil, puis les appareils liés (reconnus par leur session).
  const anchors: { kind: 'this' | 'linked'; session?: AuthSession; link?: Link; members: AuthSession[] }[] = [];
  const current = sessions.find((s) => s.current);
  if (current) {
    anchors.push({ kind: 'this', session: current, members: [current] });
    used.add(current.id_hash);
  }
  for (const l of links) {
    const s = sessions.find((x) => x.id_hash === l.sessionId && !used.has(x.id_hash));
    if (s) used.add(s.id_hash);
    anchors.push({ kind: 'linked', session: s, link: l, members: s ? [s] : [] });
  }
  // Anciennes sessions d'un appareil déjà affiché : rattachées à cet appareil.
  for (const s of sessions) {
    if (used.has(s.id_hash)) continue;
    const a = anchors.find((x) => x.session && signature(x.session) === signature(s));
    if (a) {
      a.members.push(s);
      used.add(s.id_hash);
    }
  }
  // Autres appareils connectés au compte : une ligne par appareil distinct.
  const others = new Map<string, AuthSession[]>();
  for (const s of sessions) {
    if (used.has(s.id_hash)) continue;
    const k = signature(s);
    others.set(k, [...(others.get(k) ?? []), s]);
  }
  const rows: DeviceRow[] = anchors.map((a) => {
    const latest = a.members.slice().sort((x, y) => lastUsed(y) - lastUsed(x))[0] ?? a.session;
    if (a.kind === 'this') return { key: 'this', kind: 'this', title: deviceName(), subtitle: sessionLine(latest, a.members.length), mobile: isMobile(latest, Platform.OS) };
    const l = a.link!;
    return {
      key: `link:${l.peerId}`,
      kind: 'linked',
      title: l.name,
      subtitle: [statusLine(l), sessionLine(latest, a.members.length)].filter(Boolean).join(' · '),
      mobile: isMobile(latest, l.platform),
      link: l,
    };
  });
  const rest = [...others.values()]
    .map((g) => g.sort((x, y) => lastUsed(y) - lastUsed(x)))
    .sort((x, y) => lastUsed(y[0]) - lastUsed(x[0]))
    .map((g) => {
      const s = g[0];
      const c = s.client_info ?? {};
      return {
        key: `s:${s.id_hash}`,
        kind: 'other' as const,
        title: [c.platform || c.os, c.browser].filter(Boolean).join(' · ') || tr('Appareil inconnu'),
        subtitle: sessionLine({ ...s, client_info: { ...c, platform: null, browser: null } }, g.length),
        mobile: isMobile(s),
      };
    });
  return [...rows, ...rest];
}

export function DevicesSection() {
  const { theme: t } = useSettings();
  const session = useSession();
  const ep = useEndpoints();
  const toast = useToast();
  const links = useLinks();
  const [sessions, setSessions] = useState<AuthSession[] | null>(sessionsCache?.list ?? null);
  const [sessionsError, setSessionsError] = useState('');
  const [showCode, setShowCode] = useState<{ code: string; expiresAt: number } | null>(null);
  const [paired, setPaired] = useState<Link | null>(null);
  const [scan, setScan] = useState(false);
  const [enter, setEnter] = useState(false);
  const [typed, setTyped] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cred = session.credential('user');

  useEffect(() => {
    const l = () => sessionsCache && cred && sessionsCache.token === cred.token && setSessions(sessionsCache.list);
    sessionListeners.add(l);
    return () => {
      sessionListeners.delete(l);
    };
  }, [cred?.token]);
  const seq = React.useRef(0);
  const loadSessions = useCallback(async () => {
    if (!cred) return setSessions(null);
    const mine = ++seq.current;
    try {
      await refreshSessions(ep.api, cred.token);
      if (mine === seq.current) setSessionsError('');
    } catch (e) {
      // Seule la dernière demande compte (l'adresse de l'instance a pu changer entre-temps).
      if (mine === seq.current) setSessionsError(e instanceof Error ? e.message : String(e));
    }
  }, [cred?.token, ep.api]);
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);
  const account = currentAccount();
  const rows = useMemo(() => deviceRows(sessions ?? [], links.filter((l) => l.accountId === account)), [sessions, links, account]);

  if (!session.hasUser) {
    return (
      <Box title="Appareils" icon="phone-portrait-outline" collapsible={false}>
        <Text style={{ color: t.textMuted, fontSize: t.font(13), lineHeight: t.font(19) }}>
          {tr('Connecte-toi à ton compte Fluxer pour voir tes appareils et connecter FluxerHooks sur un autre appareil.')}
        </Text>
      </Box>
    );
  }

  const host = canHost();
  const openCode = async () => {
    try {
      setPaired(null);
      setShowCode(
        await startPairing((link) => {
          setPaired(link);
          toast(tr('Appareil connecté : {name}', { name: link.name }), 'success');
          setTimeout(() => setShowCode(null), 1800);
        }),
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    }
  };
  const finishPair = async (mode: StartMode) => {
    if (!pending) return;
    setBusy(true);
    try {
      const l = await pairWithCode(pending, mode);
      toast(tr('Appareil connecté : {name}', { name: l.name }), 'success');
      setPending(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
      setPending(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box title="Appareils" icon="phone-portrait-outline" subtitle={links.length ? tr('{n} appareil(s) lié(s)', { n: links.length }) : undefined} collapsible={false}>
      <Text style={{ color: t.textMuted, fontSize: t.font(13), lineHeight: t.font(19) }}>
        {tr('Connecte FluxerHooks sur tes autres appareils connectés au même compte Fluxer : leurs données se synchronisent automatiquement dès qu’ils sont sur le même Wi-Fi.')}
      </Text>

      <SectionLabel right={<IconBtn icon="refresh-outline" label="Actualiser" size={16} onPress={loadSessions} />}>{tr('Appareils de ton compte')}</SectionLabel>
      {!!sessionsError && <Text style={{ color: t.danger, fontSize: t.font(12) }}>{tr(sessionsError)}</Text>}
      {rows.map((r) => (
        <ListRow
          key={r.key}
          icon={r.mobile ? 'phone-portrait-outline' : 'desktop-outline'}
          title={r.title}
          subtitle={r.subtitle}
          right={
            r.kind === 'this' ? (
              <Badge text="Cet appareil" />
            ) : r.link ? (
              <IconBtn
                icon="trash-outline"
                label="Délier cet appareil"
                size={18}
                onPress={() =>
                  Alert.alert(tr('Délier {name} ?', { name: r.link!.name }), 'Les données ne seront plus synchronisées avec cet appareil. Rien n’est supprimé.', [
                    { text: 'Annuler', style: 'cancel' },
                    { text: 'Délier', style: 'destructive', onPress: () => removeLink(r.link!.peerId) },
                  ])
                }
              />
            ) : undefined
          }
        />
      ))}

      <Stack row gap={8}>
        {host ? (
          <Button flex variant="primary" icon="qr-code-outline" label="Connecter un appareil" onPress={openCode} />
        ) : (
          <Button flex variant="primary" icon="scan-outline" label="Scanner le QR code" onPress={() => setScan(true)} />
        )}
        <Button flex icon="keypad-outline" label="Saisir un code" onPress={() => setEnter(true)} />
      </Stack>
      {links.length > 0 && <Button icon="sync-outline" label="Synchroniser maintenant" onPress={() => syncAll()} />}

      {/* Code de connexion (Desktop) */}
      <Dialog visible={!!showCode} onClose={() => { stopPairing(); setShowCode(null); }} title="Connecter un appareil" icon="qr-code-outline" maxWidth={440}>
        {paired ? (
          <Text style={{ color: t.success, fontSize: t.font(15), fontWeight: '700' }}>{tr('Appareil connecté : {name}', { name: paired.name })}</Text>
        ) : (
          showCode && (
            <>
              <Text style={{ color: t.textMuted, fontSize: t.font(13), lineHeight: t.font(19) }}>
                {tr('Sur ton téléphone, ouvre FluxerHooks → Paramètres → Appareils → « Scanner le QR code ». Il doit être connecté au même compte Fluxer et au même Wi-Fi.')}
              </Text>
              <View style={{ alignItems: 'center', padding: 8 }}>
                <QrCode value={showCode.code} size={260} />
              </View>
              <Text style={{ color: t.textFaint, fontSize: t.font(12), textAlign: 'center' }}>
                {tr('En attente de l’autre appareil… Code valable jusqu’à {h}.', { h: new Date(showCode.expiresAt).toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' }) })}
              </Text>
              <Button
                icon="copy-outline"
                label="Copier le code (autre ordinateur)"
                onPress={async () => {
                  await Clipboard.setStringAsync(showCode.code);
                  toast('Code copié.', 'success');
                }}
              />
            </>
          )
        )}
      </Dialog>

      {/* Scanner (Android) */}
      <Dialog visible={scan} onClose={() => setScan(false)} title="Scanner le QR code" icon="scan-outline" maxWidth={440}>
        <Text style={{ color: t.textMuted, fontSize: t.font(13), lineHeight: t.font(19) }}>
          {tr('Sur ton ordinateur, ouvre FluxerHooks Desktop → Paramètres → Appareils → « Connecter un appareil », puis vise le QR code.')}
        </Text>
        {scan && (
          <Scanner
            onCode={(code) => {
              setScan(false);
              setPending(code);
            }}
          />
        )}
      </Dialog>

      {/* Saisie du code */}
      <Dialog visible={enter} onClose={() => setEnter(false)} title="Saisir un code" icon="keypad-outline" maxWidth={440}>
        <Input label="Code de connexion" value={typed} onChangeText={setTyped} placeholder="FHLINK1.…" autoCapitalize="none" autoCorrect={false} multiline mono />
        <Button
          variant="primary"
          icon="link-outline"
          label="Continuer"
          disabled={!/FHLINK1\./.test(typed)}
          onPress={() => {
            setEnter(false);
            setPending(typed.trim());
            setTyped('');
          }}
        />
      </Dialog>

      {/* Données de départ */}
      <Dialog visible={!!pending} onClose={() => !busy && setPending(null)} title="Données de départ" icon="git-merge-outline" maxWidth={440}>
        <Text style={{ color: t.textMuted, fontSize: t.font(13), lineHeight: t.font(19) }}>
          {tr('Que faire des données déjà présentes sur les deux appareils ? Ensuite, les modifications se synchronisent automatiquement.')}
        </Text>
        <Button variant="primary" icon="git-merge-outline" label="Fusionner les deux appareils" loading={busy} onPress={() => finishPair('merge')} />
        <Button icon="phone-portrait-outline" label="Garder les données de cet appareil" disabled={busy} onPress={() => finishPair('mine')} />
        <Button icon="download-outline" label="Prendre les données de l’autre appareil" disabled={busy} onPress={() => finishPair('theirs')} />
      </Dialog>
    </Box>
  );
}
