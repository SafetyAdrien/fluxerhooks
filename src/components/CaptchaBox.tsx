import React, { useCallback, useEffect, useRef, useState } from 'react';
import { tr } from '../i18n';
import { ActivityIndicator, Animated, Easing, Pressable, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSettings } from '../state/settings';
import { useEndpoints } from '../state/useEndpoints';
import { fetchLoginChallenge } from '../api/fluxer';
import { cancelAltcha, HINT_HI, HINT_LO, solveAltcha } from '../api/altcha';

/**
 * Widget CAPTCHA « Je ne suis pas un robot » façon ALTCHA (le système utilisé par Fluxer).
 * - Sans image ni pistage : une preuve de travail calculée sur le téléphone, en natif multi-cœurs.
 * - Démarre tout seul dès que l'identifiant et le mot de passe sont saisis (ou au toucher),
 *   pour que la connexion soit instantanée au moment d'appuyer sur « Se connecter ».
 * - Le jeton est valable 10 minutes et à usage unique ; il est renouvelé automatiquement.
 */

export type CaptchaStatus = 'idle' | 'loading' | 'verifying' | 'verified' | 'not_required' | 'error';

const TOKEN_TTL_MS = 9 * 60 * 1000; // défi valable 10 min côté serveur : marge d'une minute

export interface CaptchaHandle {
  status: CaptchaStatus;
  tries: number;
  elapsed: number;
  error: string | null;
  /** Jeton prêt (ou null si non requis). Lance la vérification si besoin et attend la fin. */
  obtain: () => Promise<string | null>;
  /** Résout un défi renvoyé par le serveur (jeton refusé / expiré) en affichant la progression. */
  solveChallenge: (challenge: any) => Promise<string>;
  /** À appeler après un envoi : le jeton est consommé. */
  consume: () => void;
  start: () => void;
}

export function useCaptcha(): CaptchaHandle {
  const ep = useEndpoints();
  const [status, setStatus] = useState<CaptchaStatus>('idle');
  const [tries, setTries] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const token = useRef<{ value: string | null; at: number } | null>(null);
  const pending = useRef<Promise<string | null> | null>(null);
  const alive = useRef(true);
  useEffect(() => () => void ((alive.current = false), cancelAltcha()), []);

  const solveChallenge = useCallback(async (challenge: any) => {
    setStatus('verifying');
    setTries(0);
    setError(null);
    const t0 = Date.now();
    const timer = setInterval(() => alive.current && setElapsed((Date.now() - t0) / 1000), 100);
    try {
      const tok = await solveAltcha(challenge, (n) => alive.current && setTries(n));
      if (alive.current) {
        setElapsed((Date.now() - t0) / 1000);
        setStatus('verified');
      }
      return tok;
    } catch (e) {
      if (alive.current) {
        setStatus('error');
        setError(e instanceof Error ? e.message : String(e));
      }
      throw e;
    } finally {
      clearInterval(timer);
    }
  }, []);

  const run = useCallback(() => {
    if (pending.current) return pending.current;
    const p = (async () => {
      setStatus('loading');
      setError(null);
      try {
        const challenge = await fetchLoginChallenge(ep);
        if (!challenge) {
          token.current = { value: null, at: Date.now() };
          if (alive.current) setStatus('not_required');
          return null;
        }
        const tok = await solveChallenge(challenge);
        token.current = { value: tok, at: Date.now() };
        return tok;
      } catch (e) {
        if (alive.current) {
          setStatus('error');
          setError(e instanceof Error ? e.message : String(e));
        }
        throw e;
      } finally {
        pending.current = null;
      }
    })();
    pending.current = p;
    return p;
  }, [ep, solveChallenge]);

  // Expiration : on repasse à l'état initial pour qu'un nouveau défi soit demandé.
  useEffect(() => {
    if (status !== 'verified') return;
    const h = setTimeout(() => {
      token.current = null;
      if (alive.current) setStatus('idle');
    }, TOKEN_TTL_MS);
    return () => clearTimeout(h);
  }, [status]);

  const obtain = useCallback(async () => {
    const tk = token.current;
    if (tk && Date.now() - tk.at < TOKEN_TTL_MS) return tk.value;
    return run();
  }, [run]);

  const consume = useCallback(() => {
    if (token.current?.value) {
      token.current = null;
      setStatus('idle');
    }
  }, []);

  const start = useCallback(() => {
    if (status === 'idle' || status === 'error') run().catch(() => {});
  }, [status, run]);

  return { status, tries, elapsed, error, obtain, solveChallenge, consume, start };
}

export function CaptchaBox({ captcha }: { captcha: CaptchaHandle }) {
  const { theme: t, haptic } = useSettings();
  const { status, tries, error, elapsed } = captcha;
  const pop = useRef(new Animated.Value(status === 'verified' ? 1 : 0)).current;
  const bar = useRef(new Animated.Value(0)).current;

  const done = status === 'verified' || status === 'not_required';
  const busy = status === 'loading' || status === 'verifying';

  useEffect(() => {
    if (done) {
      haptic('success');
      pop.setValue(0.4);
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
    } else pop.setValue(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  // Progression estimée : le compteur est tiré dans [HINT_LO, HINT_HI], exploré en premier.
  const pct = status === 'verifying' ? Math.min(0.96, 0.08 + tries / (HINT_HI - HINT_LO + 1)) : done ? 1 : status === 'loading' ? 0.04 : 0;
  useEffect(() => {
    Animated.timing(bar, { toValue: pct, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
  }, [pct, bar]);

  const borderColor = status === 'error' ? t.danger : done ? t.success : t.border;
  const label =
    status === 'verified'
      ? 'Vérifié'
      : status === 'not_required'
        ? 'Aucune vérification requise'
        : busy
          ? 'Vérification…'
          : status === 'error'
            ? 'Échec de la vérification'
            : 'Je ne suis pas un robot';
  const sub =
    status === 'verified'
      ? `Preuve calculée en ${elapsed.toFixed(1)} s · valable 10 min`
      : status === 'verifying'
        ? `${tries} calculs · ${elapsed.toFixed(1)} s`
        : status === 'loading'
          ? 'Demande du défi à Fluxer…'
          : status === 'error'
            ? (error ?? 'Touchez pour réessayer')
            : 'Touchez pour vérifier';

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done, busy }}
      accessibilityLabel={label}
      disabled={busy || done}
      onPress={captcha.start}
      style={({ pressed }) => ({
        borderWidth: 1.5,
        borderColor,
        borderRadius: t.radiusSm,
        backgroundColor: pressed ? t.surface : t.surface2,
        overflow: 'hidden',
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: t.z(12) }}>
        <View
          style={{
            width: t.z(30),
            height: t.z(30),
            borderRadius: t.z(8),
            borderWidth: done ? 0 : 2,
            borderColor: status === 'error' ? t.danger : t.textFaint,
            backgroundColor: done ? t.success : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {busy ? (
            <ActivityIndicator size="small" color={t.accent} />
          ) : done ? (
            <Animated.View style={{ transform: [{ scale: pop }] }}>
              <Ionicons name="checkmark-sharp" size={t.z(22)} color="#fff" />
            </Animated.View>
          ) : status === 'error' ? (
            <Ionicons name="refresh" size={t.z(18)} color={t.danger} />
          ) : null}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: t.text, fontWeight: '700', fontSize: t.font(15) }}>{tr(label)}</Text>
          <Text numberOfLines={2} style={{ color: status === 'error' ? t.danger : t.textMuted, fontSize: t.font(12) }}>
            {sub}
          </Text>
        </View>
        <View style={{ alignItems: 'center', gap: 2, flexShrink: 0 }}>
          <MaterialCommunityIcons name={done ? 'shield-check' : 'shield-outline'} size={t.z(24)} color={done ? t.success : t.textMuted} />
          <Text style={{ color: t.textFaint, fontSize: t.font(9), fontWeight: '800', letterSpacing: 0.6 }}>{tr("ALTCHA")}</Text>
        </View>
      </View>
      <View style={{ height: 3, backgroundColor: 'transparent' }}>
        <Animated.View
          style={{
            height: 3,
            backgroundColor: done ? t.success : status === 'error' ? t.danger : t.accent,
            width: bar.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            opacity: status === 'idle' ? 0 : 1,
          }}
        />
      </View>
    </Pressable>
  );
}
