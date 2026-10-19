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
