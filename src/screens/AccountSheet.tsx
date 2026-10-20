import React, { useEffect, useRef, useState } from 'react';
import { tr } from '../i18n';
import { ActivityIndicator, Alert, Animated, Image, Linking, Modal, Pressable, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { apiFor, avatarUrl, bannerUrl, guildIconUrl, loginMfaTotp, loginWithPassword } from '../api/fluxer';
import { CaptchaBox, useCaptcha } from '../components/CaptchaBox';
import { BrandIcon, brandInfo } from '../components/BrandIcon';
import { useSettings } from '../state/settings';
import { useSession } from '../state/session';
import { useEndpoints } from '../state/useEndpoints';
import { Avatar, Badge, Box, Button, Dialog, FieldButton, Grid, Input, Segmented, Sheet, Stack, Tip, useToast } from '../components/ui';
import { Markdown, MentionContext } from '../components/Markdown';
import { type LandingAction } from './LandingPage';
import { ProfilePanel } from './ProfilePanel';
import { type SavedAccount } from '../state/session';
import type { FluxerProfile } from '../types';
import { intToHex } from '../utils/parse';

function LoginForm({ onDone, onCancel, adding, reauth }: { onDone: () => void; onCancel?: () => void; adding?: boolean; reauth?: SavedAccount | null }) {
  const { theme: t, setUserToken, haptic } = useSettings();
  const ep = useEndpoints();
  const toast = useToast();
  const [login, setLogin] = useState(reauth?.username ?? '');
  const [password, setPassword] = useState('');
  const [ticket, setTicket] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  // CAPTCHA : uniquement au toucher de la case « Je ne suis pas un robot ».
  const captcha = useCaptcha();
  const verified = captcha.status === 'verified' || captcha.status === 'not_required';
  const [error, setError] = useState<string | null>(null);

  const finish = async (tok?: string) => {
    if (!tok) throw new Error(tr('Réponse inattendue du serveur.'));
    await setUserToken(tok);
    haptic('success');
    toast('Connecté à Fluxer ✔', 'success');
    onDone();
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (ticket) {
        const r = await loginMfaTotp(ep, ticket, code);
        return await finish(r.token);
      }
      const pre = captcha.peek();
      if (pre === undefined) {
        captcha.reset();
        throw new Error(tr('Coche « Je ne suis pas un robot » avant de te connecter.'));
      }
      // Jeton refusé ou expiré par Fluxer : pas de nouvelle vérification automatique, l'utilisateur recoche la case.
      const r = await loginWithPassword(ep, login, password, async () => {
        throw new Error(tr('La vérification a expiré. Coche de nouveau « Je ne suis pas un robot ».'));
      }, pre ?? undefined);
      captcha.consume();
      if (r.mfa) {
        if (!r.mfa.methods.includes('totp') && !r.mfa.methods.includes('backup_codes')) {
          throw new Error(tr('Ton compte utilise uniquement une clé de sécurité (WebAuthn), non prise en charge par FluxerHooks.'));
        }
        setTicket(r.mfa.ticket);
        return;
      }
      await finish(r.token);
    } catch (e) {
      captcha.reset();
      haptic('error');
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack>
      <Box title={reauth ? tr('Reconnecter {name}', { name: reauth.global_name || reauth.username }) : adding ? 'Ajouter un compte' : 'Se connecter à Fluxer'} icon={reauth ? 'refresh-circle-outline' : adding ? 'person-add-outline' : 'person-circle-outline'} collapsible={false}>
        {reauth && (
          <Text style={{ color: t.text, fontSize: t.font(13), lineHeight: t.font(19) }}>
            {tr('La session de ce compte a expiré. Connecte-toi de nouveau : tu basculeras dessus automatiquement.')}
          </Text>
        )}
        <Text style={{ color: t.textMuted, fontSize: t.font(13), lineHeight: t.font(19) }}>
          {tr("Ton compte donne accès à tes serveurs, salons, threads et tags de forum, et à ton profil complet. Le token de session est stocké chiffré sur ce téléphone et n’est envoyé qu’à ton instance Fluxer.")}
        </Text>
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
        ) : (
          <>
            <Input label="E-mail ou identifiant" value={login} onChangeText={setLogin} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
            <Input label="Mot de passe" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
          </>
        )}
        {!ticket && <CaptchaBox captcha={captcha} />}
        {error && (
          <View style={{ flexDirection: 'row', gap: 8, padding: 10, borderRadius: t.radiusSm, borderLeftWidth: 4, borderLeftColor: t.danger, backgroundColor: t.surface2 }}>
            <Ionicons name="alert-circle" size={t.z(18)} color={t.danger} />
            <Text style={{ color: t.text, flex: 1, fontSize: t.font(13) }}>{error}</Text>
          </View>
        )}
        <Button
          variant="primary"
          icon="log-in-outline"
          label={ticket ? 'Valider le code' : 'Se connecter'}
          loading={busy}
          disabled={ticket ? code.trim().length < 6 : !login.trim() || password.length < 8 || !verified}
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
                  const kindLabel = kind === 'domain' ? tr('Domaine') : (brandInfo(kind)?.title ?? String(c.type));
                  return (
                    <Tip key={c.id} title={`${kindLabel} · ${c.name}`} text={c.verified ? 'Connexion vérifiée par Fluxer.' : 'Connexion non vérifiée.'} align="left" style={{ maxWidth: '100%' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 6, paddingRight: 10, paddingVertical: 6, borderRadius: t.radius, backgroundColor: t.surface2 }}>
                        <BrandIcon type={kind} size={t.z(26)} radius={t.z(8)} fallbackBg={t.accent} borderColor={t.border} />
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
function AccountSwitcher({ onAdd, onReauth }: { onAdd: () => void; onReauth: (a: SavedAccount) => void }) {
  const { theme: t, haptic } = useSettings();
  const ep = useEndpoints();
  const toast = useToast();
  const { user, accounts, switchAccount, forgetAccount } = useSession();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [switching, setSwitching] = useState<SavedAccount | null>(null);
  const fade = useRef(new Animated.Value(0)).current;
  const others = accounts.filter((a) => a.id !== user?.id);
  const pick = async (id: string, name: string) => {
    if (id === user?.id) return setOpen(false);
    haptic('light');
    setBusy(id);
    // Écran de chargement pendant la transition ; on reste ensuite à la même place dans le profil.
    setOpen(false);
    setSwitching(accounts.find((a) => a.id === id) ?? null);
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    const t0 = Date.now();
    const res = await switchAccount(id).catch(() => 'reauth' as const);
    const ok = res === 'ok';
    await new Promise((res) => setTimeout(res, Math.max(0, 900 - (Date.now() - t0))));
    await new Promise<void>((res) => Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => res()));
    setSwitching(null);
    setBusy(null);
    if (ok) {
      haptic('success');
      toast(tr('Connecté en tant que {name}', { name }), 'success');
    } else {
      // Session expirée : formulaire de connexion prérempli pour ce compte, puis bascule automatique.
      const a = accounts.find((x) => x.id === id);
      if (a) onReauth(a);
    }
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
      <Modal visible={!!switching} transparent animationType="none" statusBarTranslucent onRequestClose={() => {}}>
        <Animated.View style={{ flex: 1, opacity: fade, alignItems: 'center', justifyContent: 'center' }} accessibilityLiveRegion="polite">
          <BlurView intensity={30} tint={t.dark ? 'dark' : 'light'} experimentalBlurMethod="dimezisBlurView" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.bg, opacity: 0.82 }} />
          {switching && (
            <View style={{ alignItems: 'center', gap: 14, padding: 24 }}>
              <View style={{ padding: 4, borderRadius: 999, borderWidth: 2, borderColor: t.accent }}>
                <Avatar uri={avatarUrl(ep, switching.id, switching.avatar)} name={switching.global_name || switching.username} size={t.z(84)} />
              </View>
              <Text style={{ color: t.text, fontWeight: '900', fontSize: t.font(20), textAlign: 'center' }}>{switching.global_name || switching.username}</Text>
              <Text style={{ color: t.textMuted, fontSize: t.font(13) }}>@{switching.username}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 }}>
                <ActivityIndicator color={t.accent} />
                <Text style={{ color: t.textMuted, fontSize: t.font(14), fontWeight: '600' }}>{tr('Changement de compte…')}</Text>
              </View>
            </View>
          )}
        </Animated.View>
      </Modal>
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

/** Bouton rond de la barre du profil (panneau latéral, paramètres). */
function HeaderButton({ icon, label, onPress, active }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; label: string; onPress: () => void; active?: boolean }) {
  const { theme: t, haptic } = useSettings();
  return (
    <Pressable
      onPress={() => {
        haptic('light');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={tr(label)}
      hitSlop={6}
      style={({ pressed }) => ({
        width: t.z(40),
        height: t.z(40),
        borderRadius: t.z(14),
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: active ? t.accentSoft : pressed ? t.accentSoft : t.surface2,
        borderWidth: 1,
        borderColor: active ? t.accent : t.border,
        transform: [{ scale: pressed ? 0.94 : 1 }],
      })}
    >
      <MaterialCommunityIcons name={icon} size={t.z(21)} color={active ? t.accent : t.text} />
    </Pressable>
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
  /** Ouvre une autre page (paramètres, données…) à la place du profil. */
  onAction: (a: LandingAction) => void;
  onOpenEditor: () => void;
}) {
  const { hasUser } = useSession();
  const [adding, setAdding] = useState(false);
  const [reauth, setReauth] = useState<SavedAccount | null>(null);
  const [panel, setPanel] = useState(false);
  const done = () => {
    setAdding(false);
    setReauth(null);
  };
  const profile = hasUser && !adding;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      // Profil : pas de titre (plus de place pour le contenu) ; connexion : titre explicite.
      title={reauth ? 'Reconnecter le compte' : adding ? 'Ajouter un compte' : hasUser ? '' : 'Compte Fluxer'}
      fullscreen
      headerRight={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {profile && <AccountSwitcher onAdd={() => setAdding(true)} onReauth={(a) => { setReauth(a); setAdding(true); }} />}
          {profile && <HeaderButton icon="dock-right" label="Sauvegardes et guides" active={panel} onPress={() => setPanel(true)} />}
          {!adding && <HeaderButton icon="cog" label="Paramètres" onPress={() => onAction('settings')} />}
        </View>
      }
    >
      <ProfilePanel
        visible={panel}
        onClose={() => setPanel(false)}
        onOpenEditor={() => {
          setPanel(false);
          onOpenEditor();
        }}
        onManage={() => {
          setPanel(false);
          onAction('data');
        }}
      />
      {hasUser && !adding ? (
        <Profile
          onBrowse={() => {
            onClose();
            onBrowse();
          }}
        />
      ) : (
        <LoginForm key={reauth?.id ?? 'new'} adding={adding} reauth={reauth} onDone={done} onCancel={adding ? done : undefined} />
      )}
    </Sheet>
  );
}
