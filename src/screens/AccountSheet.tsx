import React, { useEffect, useRef, useState } from 'react';
import { Image, Linking, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { avatarUrl, bannerUrl, guildIconUrl, loginMfaTotp, loginWithPassword } from '../api/fluxer';
import { solveAltcha } from '../api/altcha';
import { useSettings } from '../state/settings';
import { useSession } from '../state/session';
import { useEndpoints } from '../state/useEndpoints';
import { Avatar, Badge, Box, Button, Input, ListRow, Segmented, Sheet, Stack, useToast } from '../components/ui';
import { Markdown } from '../components/Markdown';
import { intToHex } from '../utils/parse';

function LoginForm({ onDone }: { onDone: () => void }) {
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
  const [captcha, setCaptcha] = useState<number | null>(null);
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
      const r = await loginWithPassword(ep, login, password, async (ch) => {
        setCaptcha(0);
        try {
          return await solveAltcha(ch, (n) => setCaptcha(n));
        } finally {
          setCaptcha(null);
        }
      });
      if (r.mfa) {
        if (!r.mfa.methods.includes('totp') && !r.mfa.methods.includes('backup_codes')) {
          throw new Error('Ton compte utilise uniquement une clé de sécurité (WebAuthn), non prise en charge ici. Utilise la connexion par token.');
        }
        setTicket(r.mfa.ticket);
        return;
      }
      await finish(r.token);
    } catch (e) {
      haptic('error');
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack>
      <Box title="Se connecter à Fluxer" icon="person-circle-outline" collapsible={false}>
        <Text style={{ color: t.textMuted, fontSize: t.font(13), lineHeight: t.font(19) }}>
          Ton compte donne accès à tes serveurs, salons, threads et tags de forum, et à ton profil complet. Le token de session est stocké chiffré sur ce téléphone et n’est envoyé qu’à ton instance Fluxer.
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
            <Text style={{ color: t.text, fontWeight: '700' }}>Double authentification</Text>
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
        {captcha !== null && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.accentSoft, padding: 10, borderRadius: t.radiusSm }}>
            <Ionicons name="shield-checkmark-outline" size={t.z(18)} color={t.accent} />
            <Text style={{ color: t.text, flex: 1, fontSize: t.font(13) }}>
              Vérification anti-robot en cours sur ton téléphone… ({captcha} essais)
            </Text>
          </View>
        )}
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
          disabled={ticket ? code.trim().length < 6 : mode === 'token' ? !token.trim() : !login.trim() || password.length < 8}
          onPress={submit}
        />
        {ticket && <Button variant="ghost" label="Annuler" onPress={() => { setTicket(null); setCode(''); }} />}
      </Box>
    </Stack>
  );
}

function Profile({ onBrowse }: { onBrowse: () => void }) {
  const { theme: t } = useSettings();
  const ep = useEndpoints();
  const toast = useToast();
  const { user, guilds, loadGuilds, signOut, refreshMe } = useSession();
  const [showEmail, setShowEmail] = useState(false);
  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    loadGuilds('user').catch(() => {});
  }, [loadGuilds]);
  if (!user) {
    return (
      <Stack>
        <Text style={{ color: t.textMuted, textAlign: 'center' }}>Chargement du profil…</Text>
        <Button icon="refresh" label="Réessayer" onPress={refreshMe} />
        <Button variant="danger" icon="log-out-outline" label="Se déconnecter" onPress={signOut} />
      </Stack>
    );
  }
  const name = user.global_name || user.username;
  const banner = bannerUrl(ep, user.id, user.banner);
  const accent = user.accent_color != null ? intToHex(user.accent_color) : t.accent;
  const list = guilds.user;
  const extra = Object.entries(user).filter(
    ([k, v]) =>
      !['id', 'username', 'discriminator', 'global_name', 'avatar', 'banner', 'bio', 'pronouns', 'accent_color', 'email', 'verified', 'mfa_enabled', 'premium_type', 'premium_since', 'bot', 'flags'].includes(k) &&
      (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') &&
      v !== '' &&
      !/token|password|secret/i.test(k),
  );

  return (
    <Stack>
      <View style={{ borderRadius: t.radius, overflow: 'hidden', backgroundColor: t.surface, borderWidth: 1, borderColor: t.border }}>
        {banner ? (
          <Image source={{ uri: banner }} style={{ width: '100%', aspectRatio: 3 }} />
        ) : (
          <LinearGradient colors={[accent, t.accentPressed]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: '100%', aspectRatio: 3 }} />
        )}
        <View style={{ paddingHorizontal: t.pad, marginTop: -t.z(40) }}>
          <View style={{ borderRadius: 999, borderWidth: 5, borderColor: t.surface, alignSelf: 'flex-start' }}>
            <Avatar uri={avatarUrl(ep, user.id, user.avatar, 256)} name={name} size={t.z(80)} />
          </View>
        </View>
        <View style={{ padding: t.pad, gap: 6 }}>
          <Text style={{ color: t.text, fontSize: t.font(22), fontWeight: '900' }}>{name}</Text>
          <Text style={{ color: t.textMuted, fontSize: t.font(14) }}>
            @{user.username}
            {user.discriminator && user.discriminator !== '0' && user.discriminator !== '0000' ? `#${user.discriminator}` : ''}
            {user.pronouns ? ` · ${user.pronouns}` : ''}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
            {!!user.premium_type && <Badge text="Plutonium" />}
            {user.verified && <Badge text="E-mail vérifié" />}
            {user.mfa_enabled && <Badge text="2FA activée" />}
            {user.bot && <Badge text="BOT" />}
          </View>
          {!!user.bio && (
            <View style={{ marginTop: 6, gap: 4 }}>
              <Text style={{ color: t.textMuted, fontWeight: '800', fontSize: t.font(11), letterSpacing: 0.8 }}>À PROPOS</Text>
              <Markdown text={user.bio} size={14} />
            </View>
          )}
        </View>
      </View>

      <Box title="Informations" icon="information-circle-outline" collapsible={false}>
        <ListRow
          icon="finger-print-outline"
          title="Identifiant"
          subtitle={user.id}
          right={<Ionicons name="copy-outline" size={t.z(18)} color={t.textMuted} />}
          onPress={async () => {
            await Clipboard.setStringAsync(user.id);
            toast('ID copié.', 'success');
          }}
        />
        {!!user.email && (
          <ListRow
            icon="mail-outline"
            title="E-mail"
            subtitle={showEmail ? user.email : user.email.replace(/^(.).*(@.*)$/, '$1•••••$2')}
            right={<Ionicons name={showEmail ? 'eye-off-outline' : 'eye-outline'} size={t.z(18)} color={t.textMuted} />}
            onPress={() => setShowEmail((v) => !v)}
          />
        )}
        {!!user.premium_since && <ListRow icon="diamond-outline" title="Premium depuis" subtitle={new Date(user.premium_since).toLocaleDateString('fr-FR')} />}
        {extra.slice(0, 8).map(([k, v]) => (
          <ListRow key={k} icon="ellipse-outline" title={k.replace(/_/g, ' ')} subtitle={String(v)} />
        ))}
      </Box>

      <Box title={`Serveurs (${list.length})`} icon="server-outline" collapsible={false}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {list.slice(0, 40).map((g) => (
            <Avatar key={g.id} uri={guildIconUrl(ep, g.id, g.icon)} name={g.name} size={t.z(44)} shape="rounded" />
          ))}
        </View>
        <Button icon="albums-outline" label="Parcourir mes serveurs et salons" onPress={onBrowse} />
      </Box>

      <Stack row gap={8}>
        <Button flex icon="open-outline" label="Ouvrir Fluxer" onPress={() => Linking.openURL(ep.webapp)} />
        <Button flex variant="danger" icon="log-out-outline" label="Déconnexion" onPress={signOut} />
      </Stack>
    </Stack>
  );
}

export function AccountSheet({ visible, onClose, onBrowse }: { visible: boolean; onClose: () => void; onBrowse: () => void }) {
  const { hasUser } = useSession();
  return (
    <Sheet visible={visible} onClose={onClose} title={hasUser ? 'Mon profil Fluxer' : 'Compte Fluxer'} full>
      {hasUser ? (
        <Profile
          onBrowse={() => {
            onClose();
            onBrowse();
          }}
        />
      ) : (
        <LoginForm onDone={() => {}} />
      )}
    </Sheet>
  );
}
