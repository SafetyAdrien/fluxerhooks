import { Platform } from 'react-native';
import * as Network from 'expo-network';
import { desktop } from '../platform/desktop';

/**
 * Accès au réseau local. Sur le bureau, les requêtes passent par le processus principal
 * (une page sécurisée ne peut pas appeler une adresse http:// du réseau local) ;
 * sur Android, par fetch (trafic local en clair autorisé, le contenu étant chiffré).
 */
export async function lanRequest(url: string, method: 'GET' | 'POST', body?: string, timeoutMs = 15_000): Promise<{ status: number; body: string }> {
  if (desktop?.link) return desktop.link.request(url, method, body ?? null, timeoutMs);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: body != null ? { 'Content-Type': 'application/json' } : undefined,
      body: body ?? undefined,
      signal: ctrl.signal,
    });
    return { status: res.status, body: await res.text() };
  } catch {
    return { status: 0, body: '' };
  } finally {
    clearTimeout(timer);
  }
}

/** Adresses IPv4 de cet appareil sur le réseau local. */
export async function localAddresses(): Promise<string[]> {
  if (desktop?.link) return desktop.link.localAddresses();
  if (Platform.OS === 'web') return [];
  try {
    const ip = await Network.getIpAddressAsync();
    return ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip) && ip !== '0.0.0.0' ? [ip] : [];
  } catch {
    return [];
  }
}

/** Nom lisible de cet appareil. */
export function deviceName(): string {
  if (desktop?.link) return desktop.link.hostname;
  const c: any = (Platform as any).constants ?? {};
  const name = [c.Manufacturer || c.Brand, c.Model].filter(Boolean).join(' ').trim();
  return name || (Platform.OS === 'android' ? 'Android' : 'Navigateur');
}

export const devicePlatform = (): string => (desktop ? desktop.platform : Platform.OS);
export const canHost = () => !!desktop?.link;

/* ---------- Connexion en direct (WebSocket) ---------- */

export interface LiveSocket {
  send(data: string): void;
  close(): void;
}
export interface LiveHandlers {
  onOpen(): void;
  onMessage(data: string): void;
  onClose(): void;
}

type DesktopLiveListener = (msg: { type: 'open' | 'message' | 'close'; id: string; data?: string; incoming?: boolean }) => void;
const desktopLive = new Map<string, LiveHandlers>();
let desktopIncoming: ((id: string) => LiveHandlers | null) | null = null;
let desktopHooked = false;
function hookDesktop() {
  if (desktopHooked || !desktop?.link?.onLive) return;
  desktopHooked = true;
  const listener: DesktopLiveListener = (msg) => {
    let h = desktopLive.get(msg.id);
    if (!h && msg.type === 'open' && msg.incoming && desktopIncoming) {
      const created = desktopIncoming(msg.id);
      if (!created) return desktop!.link!.liveClose?.(msg.id);
      desktopLive.set(msg.id, created);
      h = created;
    }
    if (!h) return;
    if (msg.type === 'open') h.onOpen();
    else if (msg.type === 'message') h.onMessage(msg.data ?? '');
    else {
      desktopLive.delete(msg.id);
      h.onClose();
    }
  };
  desktop.link.onLive(listener);
}

/** Bureau : connexions entrantes (un autre appareil lié se connecte au serveur local). */
export function onIncomingLive(factory: (send: (data: string) => void, close: () => void) => LiveHandlers | null) {
  if (!desktop?.link?.onLive) return;
  desktopIncoming = (id) =>
    factory(
      (data) => desktop!.link!.liveSend?.(id, data),
      () => desktop!.link!.liveClose?.(id),
    );
  hookDesktop();
}

/** Ouvre une connexion en direct vers un appareil lié (ws://ip:port/fluxerhooks/live). */
export async function openLive(url: string, h: LiveHandlers): Promise<LiveSocket | null> {
  if (desktop?.link?.liveConnect) {
    hookDesktop();
    const id = await desktop.link.liveConnect(url);
    if (!id) return null;
    desktopLive.set(id, h);
    return { send: (d) => desktop!.link!.liveSend?.(id, d), close: () => desktop!.link!.liveClose?.(id) };
  }
  if (typeof WebSocket === 'undefined') return null;
  try {
    const ws = new WebSocket(url);
    ws.onopen = () => h.onOpen();
    ws.onmessage = (e: any) => h.onMessage(String(e.data));
    ws.onclose = () => h.onClose();
    ws.onerror = () => {};
    return { send: (d) => ws.readyState === 1 && ws.send(d), close: () => ws.close() };
  } catch {
    return null;
  }
}
