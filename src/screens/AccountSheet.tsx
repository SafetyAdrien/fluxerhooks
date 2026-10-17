import React, { useEffect, useRef, useState } from 'react';
import { tr } from '../i18n';
import { ActivityIndicator, Alert, Image, Linking, Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { apiFor, avatarUrl, bannerUrl, guildIconUrl, loginMfaTotp, loginWithPassword } from '../api/fluxer';
import { CaptchaBox, useCaptcha } from '../components/CaptchaBox';
import { useSettings } from '../state/settings';
import { useSession } from '../state/session';
import { useEndpoints } from '../state/useEndpoints';
import { Avatar, Badge, Box, Button, Dialog, FieldButton, Grid, Input, Segmented, Sheet, Stack, Tip, useToast } from '../components/ui';
import { Markdown, MentionContext } from '../components/Markdown';
import { type LandingAction } from './LandingPage';
import { type SavedAccount } from '../state/session';
import type { FluxerProfile } from '../types';
import { intToHex } from '../utils/parse';

function LoginForm({ onDone, onCancel, adding }: { onDone: () => void; onCancel?: () => void; adding?: boolean }) {
  const { theme: t, setUserToken, haptic } = useSettings();
  const ep = useEndpoints();
  const toast = useToast();
  const [mode, setMode] = useState<'password' | 'token'>('password');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [ticket, setTicket] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const captcha = useCaptcha();
  const ready = mode === 'password' && !ticket && login.trim().length > 2 && password.length >= 8;
  // Vérification anti-robot lancée en arrière-plan dès que le formulaire est rempli.
  useEffect(() => {
    if (!ready || captcha.status !== 'idle') return;
    const h = setTimeout(captcha.start, 500);
    return () => clearTimeout(h);
  }, [ready, captcha.status, captcha.start]);
  const [error, setError] = useState<string | null>(null);

  const finish = async (tok?: string) => {
    if (!tok) throw new Error('Réponse inattendue du serveur.');
    await setUserToken(tok);
    haptic('success');
    toast('Connecté à Fluxer ✔', 'success');
    onDone();
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'token') return await finish(token.trim());
      if (ticket) {
        const r = await loginMfaTotp(ep, ticket, code);
        return await finish(r.token);
      }
      const pre = await captcha.obtain();
      const r = await loginWithPassword(ep, login, password, captcha.solveChallenge, pre ?? undefined);
      captcha.consume();
      if (r.mfa) {
        if (!r.mfa.methods.includes('totp') && !r.mfa.methods.includes('backup_codes')) {
          throw new Error('Ton compte utilise uniquement une clé de sécurité (WebAuthn), non prise en charge ici. Utilise la connexion par token.');
        }
        setTicket(r.mfa.ticket);
        return;
      }
      await finish(r.token);
    } catch (e) {
      captcha.consume();
      haptic('error');
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack>
      <Box title={adding ? 'Ajouter un compte' : 'Se connecter à Fluxer'} icon={adding ? 'person-add-outline' : 'person-circle-outline'} collapsible={false}>
        <Text style={{ color: t.textMuted, fontSize: t.font(13), lineHeight: t.font(19) }}>
          {tr("Ton compte donne accès à tes serveurs, salons, threads et tags de forum, et à ton profil complet. Le token de session est stocké chiffré sur ce téléphone et n’est envoyé qu’à ton instance Fluxer.")}
        </Text>
        {!ticket && (
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'password', label: 'E-mail', icon: 'mail-outline' },
              { value: 'token', label: 'Token', icon: 'key-outline' },
            ]}
          />
        )}
        {ticket ? (
          <>
            <Text style={{ color: t.text, fontWeight: '700' }}>{tr("Double authentification")}</Text>
            <Input
              label="Code de ton application d’authentification (ou code de secours)"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              autoFocus
              mono
              maxLength={32}
            />
          </>
        ) : mode === 'password' ? (
          <>
            <Input label="E-mail ou identifiant" value={login} onChangeText={setLogin} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
            <Input label="Mot de passe" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
          </>
        ) : (
          <Input
            label="Token de session"
            value={token}
            onChangeText={setToken}
            placeholder="flx_…"
            hint="À utiliser si tu te connectes avec une clé de sécurité ou si le CAPTCHA échoue."
            secureTextEntry
            autoCapitalize="none"
            mono
          />
        )}
        {mode === 'password' && !ticket && <CaptchaBox captcha={captcha} />}
        {error && (
          <View style={{ flexDirection: 'row', gap: 8, padding: 10, borderRadius: t.radiusSm, borderLeftWidth: 4, borderLeftColor: t.danger, backgroundColor: t.surface2 }}>
            <Ionicons name="alert-circle" size={t.z(18)} color={t.danger} />
            <Text style={{ color: t.text, flex: 1, fontSize: t.font(13) }}>{error}</Text>
          </View>
        )}
        <Button
          variant="primary"
          icon="log-in-outline"
          label={ticket ? 'Valider le code' : busy && captcha.status === 'verifying' ? 'Vérification…' : 'Se connecter'}
          loading={busy}
          disabled={ticket ? code.trim().length < 6 : mode === 'token' ? !token.trim() : !login.trim() || password.length < 8}
          onPress={submit}
        />
        {ticket && <Button variant="ghost" label="Annuler" onPress={() => { setTicket(null); setCode(''); }} />}
        {!ticket && onCancel && <Button variant="ghost" icon="arrow-back" label="Revenir au compte actuel" onPress={onCancel} />}
      </Box>
    </Stack>
  );
}

/** Ligne d'information flexible : libellé au-dessus, valeur qui passe à la ligne, bouton d'action dans le thème. */
function InfoRow({ icon, label, value, onCopy, action, tip }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string; onCopy?: () => void; action?: React.ReactNode; tip?: string }) {
  const { theme: t } = useSettings();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <Tip title={label} text={tip} align="left" style={{ flexShrink: 0 }}>
        <View style={{ width: t.z(34), height: t.z(34), borderRadius: t.radiusSm, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={t.z(17)} color={t.accent} />
        </View>
      </Tip>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: t.textMuted, fontSize: t.font(11), fontWeight: '800', letterSpacing: 0.6 }}>{tr(label).toUpperCase()}</Text>
        <Text selectable style={{ color: t.text, fontSize: t.font(14), flexShrink: 1 }}>
          {value}
        </Text>
      </View>
      {action}
      {onCopy && <FieldButton mci="content-copy" label={`Copier : ${label}`} onPress={onCopy} />}
    </View>
  );
}

/** Badge du profil Fluxer, en icône seule (libellé au toucher et pour les lecteurs d'écran). */
const PLUTONIUM = require('../../assets/badges/plutonium.png');
function IconBadge({ label, text, mci, color, image }: { label: string; text?: string; mci?: React.ComponentProps<typeof MaterialCommunityIcons>['name']; color?: string; image?: number }) {
  const { theme: t } = useSettings();
  const size = t.z(34);
  return (
    <Tip title={label} text={text} align="right">
      <View
        accessibilityRole="image"
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: t.surface2,
          borderWidth: 1,
          borderColor: t.border,
        }}
      >
        {image ? (
          <Image source={image} style={{ width: size * 0.72, height: size * 0.72 }} resizeMode="contain" />
        ) : (
          <MaterialCommunityIcons name={mci!} size={size * 0.56} color={color ?? t.text} />
        )}
      </View>
    </Tip>
  );
}

/** Icônes modernes des connexions, dans un carré aux coins arrondis. */
const CONNECTION_STYLE: Record<string, { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; bg?: string }> = {
  bsky: { icon: 'butterfly', bg: '#1185FE' },
  bluesky: { icon: 'butterfly', bg: '#1185FE' },
  domain: { icon: 'web', bg: '#0EA5E9' },
  other: { icon: 'link-variant' },
};

function Profile({ onBrowse, tiles }: { onBrowse: () => void; tiles?: React.ReactNode }) {
  const { theme: t } = useSettings();
  const ep = useEndpoints();
  const toast = useToast();
  const session = useSession();
  const { user, guilds, loadGuilds, signOut, refreshMe, credential, resolve } = session;
  const [showEmail, setShowEmail] = useState(false);
  const [profile, setProfile] = useState<FluxerProfile | null>(null);
  const [allGuilds, setAllGuilds] = useState(false);
  const [width, setWidth] = useState(0);
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    loadGuilds('user').catch(() => {});
  }, [loadGuilds]);
  useEffect(() => {
    const c = credential('user');
    if (!user || !c) return;
    apiFor(ep, c)
      .profile(user.id)
      .then(setProfile)
      .catch(() => setProfile(null));
  }, [user, ep, credential]);

  if (!user) {
    return (
      <Stack>
        <Text style={{ color: t.textMuted, textAlign: 'center' }}>{tr("Chargement du profil…")}</Text>
        <Button icon="refresh" label="Réessayer" onPress={refreshMe} />
        <Button variant="danger" icon="log-out-outline" label="Se déconnecter" onPress={signOut} />
      </Stack>
    );
  }
  const up = profile?.user_profile;
  const name = user.global_name || user.username;
  const bio = up?.bio ?? user.bio ?? '';
  const pronouns = up?.pronouns ?? user.pronouns ?? '';
  const banner = bannerUrl(ep, user.id, up?.banner ?? user.banner, 960);
  const accentInt = up?.accent_color ?? up?.banner_color ?? user.accent_color;
  const accent = accentInt != null ? intToHex(accentInt) : t.accent;
  const list = guilds.user;
  const connections = profile?.connected_accounts ?? [];
  const premiumSince = profile?.premium_since ?? user.premium_since;
  const copy = (label: string, v: string) => async () => {
    await Clipboard.setStringAsync(v);
    toast(`${label} copié.`, 'success');
  };
  // Mise en page fluide : la bannière garde une hauteur raisonnable sur grand écran.
  const bannerH = width ? Math.min(width / 2.6, t.z(170)) : t.z(130);
  const avatar = width ? Math.max(t.z(72), Math.min(t.z(112), width * 0.22)) : t.z(84);
  const extra = Object.entries(user).filter(
    ([k, v]) =>
      !['id', 'username', 'discriminator', 'global_name', 'avatar', 'banner', 'bio', 'pronouns', 'accent_color', 'email', 'verified', 'mfa_enabled', 'premium_type', 'premium_since', 'bot', 'flags'].includes(k) &&
      (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') &&
      v !== '' &&
      !/token|password|secret|phone/i.test(k),
  );

  return (
    <MentionContext.Provider value={resolve}>
      <Stack>
        {/* ----- En-tête ----- */}
        <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ borderRadius: t.radius, overflow: 'hidden', backgroundColor: t.surface, borderWidth: 1, borderColor: t.border }}>
          {banner ? (
            <Image source={{ uri: banner }} style={{ width: '100%', height: bannerH }} resizeMode="cover" />
          ) : (
            <LinearGradient colors={[accent, t.accentPressed]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: '100%', height: bannerH }} />
          )}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', gap: 10, paddingHorizontal: t.pad, marginTop: -avatar / 2 }}>
            <View style={{ borderRadius: 999, borderWidth: 5, borderColor: t.surface, backgroundColor: t.surface }}>
              <Avatar uri={avatarUrl(ep, user.id, user.avatar, 256)} name={name} size={avatar} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, flex: 1, minWidth: t.z(140), justifyContent: 'flex-end', paddingBottom: 6 }}>
              {!!user.premium_type && (
                <IconBadge
                  label="Plutonium"
                  text={`Abonnement premium de Fluxer${premiumSince ? `, actif depuis le ${new Date(premiumSince).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}.`}
                  image={PLUTONIUM}
                />
              )}
              {user.verified && <IconBadge label="E-mail vérifié" text="L’adresse e-mail du compte a été confirmée." mci="email-check-outline" color={t.success} />}
              {user.mfa_enabled && <IconBadge label="Double authentification" text="La connexion demande aussi un code (2FA) : le compte est mieux protégé." mci="shield-key-outline" color={t.accent} />}
              {user.bot && <IconBadge label="Compte bot" text="Compte automatisé, piloté par une application." mci="robot-outline" color={t.textMuted} />}
            </View>
          </View>
          <View style={{ padding: t.pad, paddingTop: 8, gap: 4 }}>
            <Text style={{ color: t.text, fontSize: t.font(22), lineHeight: t.font(28), fontWeight: '900', flexShrink: 1 }}>{name}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              <Text style={{ color: t.textMuted, fontSize: t.font(14) }}>
                @{user.username}
                {user.discriminator && user.discriminator !== '0' && user.discriminator !== '0000' ? `#${user.discriminator}` : ''}
              </Text>
              {!!pronouns && (
                <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: t.surface2, maxWidth: '100%' }}>
                  <Markdown text={pronouns} size={12} color={t.textMuted} singleLine bio />
                </View>
              )}
            </View>
          </View>
        </View>

        {/* ----- Sections : grille fluide, chaque section est repliable ----- */}
        {!!bio.trim() && (
          <Box title="À propos de moi" icon="reader-outline">
            <Markdown text={bio} size={14} bio />
          </Box>
        )}

        <Grid min={300}>

          {connections.length > 0 && (
            <Box title="Connexions" icon="link-outline" badge={String(connections.length)} defaultCollapsed>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {connections.map((c) => {
                  const kind = String(c.type).toLowerCase();
                  const kindLabel = kind === 'domain' ? 'Domaine' : kind === 'bsky' || kind === 'bluesky' ? 'Bluesky' : String(c.type);
                  return (
                    <Tip key={c.id} title={`${kindLabel} · ${c.name}`} text={c.verified ? 'Connexion vérifiée par Fluxer.' : 'Connexion non vérifiée.'} align="left" style={{ maxWidth: '100%' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 6, paddingRight: 10, paddingVertical: 6, borderRadius: t.radius, backgroundColor: t.surface2 }}>
                        <View style={{ width: t.z(26), height: t.z(26), borderRadius: t.z(8), alignItems: 'center', justifyContent: 'center', backgroundColor: (CONNECTION_STYLE[kind] ?? CONNECTION_STYLE.other).bg ?? t.accent }}>
                          <MaterialCommunityIcons name={(CONNECTION_STYLE[kind] ?? CONNECTION_STYLE.other).icon} size={t.z(16)} color="#fff" />
                        </View>
                        <Text style={{ color: t.text, fontSize: t.font(13), flexShrink: 1 }}>{c.name}</Text>
                        {c.verified && <Ionicons name="checkmark-circle" size={t.z(14)} color={t.success} />}
                      </View>
                    </Tip>
                  );
                })}
              </View>
            </Box>
          )}

          <Box title="Serveurs" icon="server-outline" badge={String(list.length)} defaultCollapsed>
            <Grid min={t.z(132)} gap={8}>
              {(allGuilds ? list : list.slice(0, 12)).map((g) => (
                <View key={g.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 6, borderRadius: t.radiusSm, backgroundColor: t.surface2 }}>
                  <Avatar uri={guildIconUrl(ep, g.id, g.icon)} name={g.name} size={t.z(32)} shape="rounded" />
                  <Text numberOfLines={2} style={{ color: t.text, fontSize: t.font(12), fontWeight: '600', flex: 1 }}>
                    {g.name}
                  </Text>
                </View>
              ))}
            </Grid>
            {list.length > 12 && <Button small variant="ghost" icon={allGuilds ? 'chevron-up' : 'chevron-down'} label={allGuilds ? 'Afficher moins' : `Afficher les ${list.length}`} onPress={() => setAllGuilds((v) => !v)} />}
            <Button icon="albums-outline" label="Parcourir mes serveurs et salons" onPress={onBrowse} />
          </Box>

          <Box title="Informations" icon="information-circle-outline" defaultCollapsed>
            <InfoRow icon="finger-print-outline" label="Identifiant" tip="Numéro unique de ton compte Fluxer, utile pour les mentions <@id> et le support." value={user.id} onCopy={copy('ID', user.id)} />
            {!!user.email && (
              <InfoRow
                icon="mail-outline"
                label="E-mail"
                tip="Visible uniquement par toi. Touche l’œil pour l’afficher en entier."
                value={showEmail ? user.email : user.email.replace(/^(.).*(@.*)$/, '$1•••••$2')}
                action={<FieldButton mci={showEmail ? 'eye-off-outline' : 'eye-outline'} label={showEmail ? 'Masquer l’e-mail' : 'Afficher l’e-mail'} onPress={() => setShowEmail((v) => !v)} />}
              />
            )}
            {!!premiumSince && <InfoRow icon="diamond-outline" label="Plutonium depuis" tip="Date d’activation de ton abonnement premium." value={new Date(premiumSince).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} />}
            {extra.slice(0, 8).map(([k, v]) => (
              <InfoRow key={k} icon="ellipse-outline" label={k.replace(/_/g, ' ')} tip={`Champ « ${k} » renvoyé par l’API Fluxer.`} value={String(v)} />
            ))}
          </Box>
        </Grid>

        <Stack row wrap gap={8}>
          <Button flex icon="open-outline" label="Ouvrir Fluxer" onPress={() => Linking.openURL(ep.webapp)} />
          <Button flex variant="danger" icon="log-out-outline" label="Déconnexion" onPress={signOut} />
        </Stack>
      </Stack>
    </MentionContext.Provider>
  );
}

/** Bouton de changement de compte (en-tête du profil) : avatar actuel + icône d'échange. */
function AccountSwitcher({ onAdd }: { onAdd: () => void }) {
  const { theme: t, haptic } = useSettings();
  const ep = useEndpoints();
  const toast = useToast();
  const { user, accounts, switchAccount, forgetAccount } = useSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const others = accounts.filter((a) => a.id !== user?.id);
  const pick = async (id: string, name: string) => {
    if (id === user?.id) return setOpen(false);
    haptic('light');
    setBusy(id);
    const ok = await switchAccount(id);
    setBusy(null);
    setOpen(false);
    toast(ok ? tr('Connecté en tant que {name}', { name }) : tr('Ce compte doit être reconnecté.'), ok ? 'success' : 'error');
  };
  const row = (a: SavedAccount, current: boolean) => {
    const name = a.global_name || a.username;
    return (
      <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable
          onPress={() => pick(a.id, name)}
          accessibilityRole="button"
          accessibilityLabel={name}
          style={({ pressed }) => ({
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: 10,
            borderRadius: t.radiusSm,
            backgroundColor: current ? t.accentSoft : pressed ? t.surface2 : 'transparent',
            borderWidth: 1,
            borderColor: current ? t.accent : 'transparent',
          })}
        >
          <Avatar uri={avatarUrl(ep, a.id, a.avatar)} name={name} size={t.z(38)} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ color: t.text, fontWeight: '800', fontSize: t.font(15) }}>{name}</Text>
            <Text numberOfLines={1} style={{ color: t.textMuted, fontSize: t.font(12) }}>@{a.username}</Text>
          </View>
          {busy === a.id ? <ActivityIndicator color={t.accent} /> : current ? <Ionicons name="checkmark-circle" size={t.z(22)} color={t.accent} /> : null}
        </Pressable>
        {!current && (
          <FieldButton
            icon="close"
            label="Retirer ce compte de la liste"
            onPress={() =>
              Alert.alert(tr('Retirer ce compte ?'), tr('Il sera oublié sur ce téléphone (sans déconnexion côté Fluxer).'), [
                { text: tr('Annuler'), style: 'cancel' },
                { text: tr('Retirer'), style: 'destructive', onPress: () => forgetAccount(a.id) },
              ])
            }
          />
        )}
      </View>
    );
  };
  if (!user) return null;
  return (
    <>
      <Pressable
        onPress={() => {
          haptic('light');
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={tr('Changer de compte')}
        hitSlop={6}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingLeft: 4,
          paddingRight: 10,
          height: t.z(40),
          marginRight: 6,
          borderRadius: 999,
          backgroundColor: pressed ? t.accentSoft : t.surface2,
          borderWidth: 1,
          borderColor: t.border,
          transform: [{ scale: pressed ? 0.95 : 1 }],
        })}
      >
        <Avatar uri={avatarUrl(ep, user.id, user.avatar)} name={user.global_name || user.username} size={t.z(30)} />
        <MaterialCommunityIcons name="account-switch-outline" size={t.z(20)} color={t.text} />
        {others.length > 0 && (
          <View style={{ minWidth: t.z(18), height: t.z(18), borderRadius: 9, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
            <Text style={{ color: t.onAccent, fontSize: t.font(10), fontWeight: '800' }}>{accounts.length}</Text>
          </View>
        )}
      </Pressable>
      <Dialog visible={open} onClose={() => setOpen(false)} title="Changer de compte" icon="people-outline">
        <View style={{ gap: 6 }}>
          {accounts.length ? accounts.map((a) => row(a, a.id === user.id)) : row({ id: user.id, username: user.username, global_name: user.global_name, avatar: user.avatar ?? null, lastUsed: 0 }, true)}
          <Button
            icon="person-add-outline"
            label="Ajouter un compte"
            onPress={() => {
              setOpen(false);
              onAdd();
            }}
          />
          <Text style={{ color: t.textFaint, fontSize: t.font(11), textAlign: 'center' }}>
            {tr('Les tokens restent chiffrés sur ce téléphone ; le changement est instantané.')}
          </Text>
        </View>
      </Dialog>
    </>
  );
}

export function AccountSheet({
  visible,
  onClose,
  onBrowse,
  onAction,
  onOpenEditor,
}: {
  visible: boolean;
  onClose: () => void;
  onBrowse: () => void;
  onAction: (a: LandingAction) => void;
  onOpenEditor: () => void;
}) {
  const { hasUser } = useSession();
  const [adding, setAdding] = useState(false);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={adding ? 'Ajouter un compte' : hasUser ? 'Mon profil Fluxer' : 'Compte Fluxer'}
      fullscreen
      headerRight={hasUser && !adding ? <AccountSwitcher onAdd={() => setAdding(true)} /> : undefined}
    >
      {hasUser && !adding ? (
        <Profile
          onBrowse={() => {
            onClose();
            onBrowse();
          }}
        />
      ) : (
        <LoginForm adding={adding} onDone={() => setAdding(false)} onCancel={adding ? () => setAdding(false) : undefined} />
      )}
    </Sheet>
  );
}
