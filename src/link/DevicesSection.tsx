import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Platform, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import * as Clipboard from 'expo-clipboard';
import qrcode from 'qrcode-generator';
import { currentLocale, tr } from '../i18n';
import { listAuthSessions, type AuthSession } from '../api/fluxer';
import { useSettings } from '../state/settings';
import { useSession } from '../state/session';
import { useEndpoints } from '../state/useEndpoints';
import { Badge, Box, Button, Dialog, IconBtn, Input, ListRow, SectionLabel, Stack, useToast } from '../components/ui';
import { Alert } from 'react-native';
import { canHost } from './transport';
import {
  currentAccount,
  getLinks,
  initLinkServer,
  pairWithCode,
  removeLink,
  setAccount,
  startPairing,
  statusOf,
  stopPairing,
  subscribe,
  syncAll,
  type Link,
  type StartMode,
} from './engine';

/* ---------- Pont avec la session (monté sous SessionProvider) ---------- */

export function LinkBridge() {
  const { userToken } = useSettings();
  const { user } = useSession();
  useEffect(() => {
    initLinkServer().catch(() => {});
  }, []);
  useEffect(() => {
    if (!userToken) setAccount(null);
    // Compte connu avec certitude seulement quand le profil a répondu pour ce token.
    else if (user?.id) setAccount(user.id);
  }, [userToken, user?.id]);
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

export function DevicesSection() {
  const { theme: t } = useSettings();
  const session = useSession();
  const ep = useEndpoints();
  const toast = useToast();
  const links = useLinks();
  const [sessions, setSessions] = useState<AuthSession[] | null>(null);
  const [sessionsError, setSessionsError] = useState('');
  const [showCode, setShowCode] = useState<{ code: string; expiresAt: number } | null>(null);
  const [paired, setPaired] = useState<Link | null>(null);
  const [scan, setScan] = useState(false);
  const [enter, setEnter] = useState(false);
  const [typed, setTyped] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cred = session.credential('user');

  const seq = React.useRef(0);
  const loadSessions = useCallback(async () => {
    if (!cred) return setSessions(null);
    const mine = ++seq.current;
    try {
      const list = await listAuthSessions(ep, cred.token);
      if (mine !== seq.current) return;
      setSessions(list);
      setSessionsError('');
    } catch (e) {
      if (mine === seq.current) setSessionsError(e instanceof Error ? e.message : String(e));
    }
  }, [cred?.token, ep.api]);
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

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

      <SectionLabel>{tr('Appareils liés à FluxerHooks')}</SectionLabel>
      {links.length === 0 && <Text style={{ color: t.textFaint, fontSize: t.font(13) }}>{tr('Aucun appareil lié pour l’instant.')}</Text>}
      {links.map((l) => (
        <ListRow
          key={l.peerId}
          icon={l.platform === 'android' || l.platform === 'ios' ? 'phone-portrait-outline' : 'desktop-outline'}
          title={l.name}
          subtitle={statusLine(l)}
          right={
            <IconBtn
              icon="trash-outline"
              label="Délier cet appareil"
              size={18}
              onPress={() =>
                Alert.alert(tr('Délier {name} ?', { name: l.name }), 'Les données ne seront plus synchronisées avec cet appareil. Rien n’est supprimé.', [
                  { text: 'Annuler', style: 'cancel' },
                  { text: 'Délier', style: 'destructive', onPress: () => removeLink(l.peerId) },
                ])
              }
            />
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

      <SectionLabel right={<IconBtn icon="refresh-outline" label="Actualiser" size={16} onPress={loadSessions} />}>{tr('Connectés à ton compte Fluxer')}</SectionLabel>
      {!!sessionsError && <Text style={{ color: t.danger, fontSize: t.font(12) }}>{tr(sessionsError)}</Text>}
      {(sessions ?? []).map((s) => {
        const ci = s.client_info ?? {};
        const mobile = ci.device === 'mobile' || /android|ios|iphone/i.test(`${ci.os ?? ''} ${ci.platform ?? ''}`);
        const title = [ci.platform || ci.os, ci.browser].filter(Boolean).join(' · ') || tr('Appareil inconnu');
        const place = [ci.location?.city, ci.location?.country].filter(Boolean).join(', ');
        return (
          <ListRow
            key={s.id_hash}
            icon={mobile ? 'phone-portrait-outline' : 'desktop-outline'}
            title={title}
            subtitle={[ci.os && ci.os !== title ? ci.os : '', place, ago(s.approx_last_used_at)].filter(Boolean).join(' · ')}
            right={s.current ? <Badge text="Cet appareil" /> : undefined}
          />
        );
      })}

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
