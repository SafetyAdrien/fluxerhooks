import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BotGatewayNative, type GatewayState } from '../../modules/bot-gateway/src';
import { apiFor } from '../api/fluxer';
import { useSettings } from './settings';
import { getEndpoints } from './useEndpoints';
import type { BotStatus } from '../types';

/**
 * Démarrage du bot : connexion au gateway Fluxer pour qu'il apparaisse « en ligne ».
 * Sur Android, un service au premier plan garde la connexion même app fermée ;
 * ailleurs (web), un WebSocket JavaScript fait le même travail tant que la page est ouverte.
 */

interface Ctx {
  state: GatewayState;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  setPresence: (status: BotStatus, text: string) => void;
  /** true quand le bot reste connecté app fermée (service Android). */
  background: boolean;
}

const BotGatewayContext = createContext<Ctx | null>(null);

/* ---------- Repli JavaScript (web / Expo Go) ---------- */

class JsGateway {
  private ws: WebSocket | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private seq: number | null = null;
  private stopped = true;
  private opts = { token: '', url: '', status: 'online', text: '' };
  constructor(private onState: (s: GatewayState) => void) {}

  start(o: { token: string; url: string; status: string; text: string }) {
    this.opts = o;
    this.stopped = false;
    this.open();
  }

  private open() {
    this.close();
    this.onState({ state: 'connecting' });
    const sep = this.opts.url.includes('?') ? '&' : '?';
    const ws = new WebSocket(`${this.opts.url}${sep}v=1&encoding=json`);
    this.ws = ws;
    ws.onmessage = (ev) => {
      let p: any;
      try {
        p = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (p.op === 10) {
        this.timer = setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ op: 1, d: this.seq })), p.d?.heartbeat_interval ?? 41250);
        ws.send(
          JSON.stringify({
            op: 2,
            d: {
              token: this.opts.token,
              properties: { os: 'Web', browser: 'FluxerHooks', device: 'FluxerHooks' },
              presence: { status: this.opts.status, afk: false, mobile: false, ...(this.opts.text ? { custom_status: { text: this.opts.text } } : {}) },
              ignored_events: ['TYPING_START', 'MESSAGE_CREATE', 'MESSAGE_UPDATE', 'PRESENCE_UPDATE', 'PRESENCE_UPDATE_BULK', 'GUILD_MEMBER_LIST_UPDATE'],
            },
          }),
        );
      } else if (p.op === 0) {
        this.seq = p.s ?? this.seq;
        if (p.t === 'READY') {
          this.onState({ state: 'online', username: p.d?.user?.username, userId: p.d?.user?.id, guilds: p.d?.guilds?.length ?? 0, since: Date.now() });
        }
      } else if (p.op === 1) ws.send(JSON.stringify({ op: 1, d: this.seq }));
    };
    ws.onclose = (ev) => {
      if (this.timer) clearInterval(this.timer);
      if (this.stopped) return;
      if (ev.code === 4004) {
        this.stopped = true;
        this.onState({ state: 'error', error: 'Token du bot refusé par Fluxer.', code: 4004 });
        return;
      }
      this.onState({ state: 'reconnecting' });
      setTimeout(() => !this.stopped && this.open(), 3000);
    };
  }

  setPresence(status: string, text: string) {
    this.opts = { ...this.opts, status, text };
    this.ws?.readyState === 1 &&
      this.ws.send(JSON.stringify({ op: 3, d: { status, afk: false, mobile: false, custom_status: text ? { text } : null } }));
  }

  private close() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
  }

  stop() {
    this.stopped = true;
    this.close();
    this.onState({ state: 'offline' });
  }
}

export function BotGatewayProvider({ children }: { children: React.ReactNode }) {
  const { settings, update, botToken, ready } = useSettings();
  const presence = settings.botPresence;
  const [state, setState] = useState<GatewayState>(() => (BotGatewayNative?.getState() as GatewayState) ?? { state: 'offline' });
  const js = useRef<JsGateway | null>(null);
  const lastToken = useRef<string>('');

  useEffect(() => {
    if (!BotGatewayNative) return;
    const sub = BotGatewayNative.addListener('onState', (s) => setState(s));
    setState(BotGatewayNative.getState());
    return () => sub.remove();
  }, []);

  const start = useCallback(async () => {
    if (!botToken) return;
    setState((s) => ({ ...s, state: 'connecting', error: undefined }));
    const ep = await getEndpoints(settings.instance);
    // L'URL officielle du gateway pour les bots ; repli sur celle de .well-known.
    const url = await apiFor(ep, { kind: 'bot', token: botToken })
      .gatewayBot()
      .then((r) => r.url || ep.gateway)
      .catch(() => ep.gateway);
    const opts = { token: botToken, url, status: presence.status, text: presence.text.trim() };
    if (BotGatewayNative) {
      await BotGatewayNative.start({ ...opts, appName: 'FluxerHooks' });
    } else {
      if (!js.current) js.current = new JsGateway(setState);
      js.current.start(opts);
    }
    if (!presence.autoStart) update({ botPresence: { ...presence, autoStart: true } });
  }, [botToken, settings.instance, presence, update]);

  const stop = useCallback(async () => {
    if (BotGatewayNative) await BotGatewayNative.stop();
    else js.current?.stop();
    setState({ state: 'offline' });
    update({ botPresence: { ...presence, autoStart: false } });
  }, [presence, update]);

  const setPresence = useCallback(
    (status: BotStatus, text: string) => {
      update({ botPresence: { ...presence, status, text } });
      if (BotGatewayNative) BotGatewayNative.setPresence({ status, text: text.trim() }).catch(() => {});
      else js.current?.setPresence(status, text.trim());
    },
    [presence, update],
  );

  // Ajout d'un token → le bot démarre ; token retiré → il s'arrête.
  useEffect(() => {
    if (!ready) return;
    const prev = lastToken.current;
    lastToken.current = botToken;
    if (!botToken) {
      if (prev) {
        if (BotGatewayNative) BotGatewayNative.stop().catch(() => {});
        else js.current?.stop();
        setState({ state: 'offline' });
      }
      return;
    }
    const running = state.state === 'online' || state.state === 'connecting' || state.state === 'reconnecting';
    if (presence.autoStart && (botToken !== prev || !running)) start().catch((e) => setState({ state: 'error', error: String(e?.message ?? e) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, botToken]);

  const value = useMemo(() => ({ state, start, stop, setPresence, background: !!BotGatewayNative }), [state, start, stop, setPresence]);
  return <BotGatewayContext.Provider value={value}>{children}</BotGatewayContext.Provider>;
}

export function useBotGateway() {
  const c = useContext(BotGatewayContext);
  if (!c) throw new Error('useBotGateway hors du BotGatewayProvider');
  return c;
}
