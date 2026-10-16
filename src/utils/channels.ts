import type { ApiChannel } from '../types';

export const WEBHOOK_TYPES = [0, 2, 5, 15, 16];
export const THREAD_TYPES = [10, 11, 12];

export interface ChannelEntry {
  channel: ApiChannel;
  group: string;
  indent: number;
}

/**
 * Ordonne les salons comme dans Fluxer : sans catégorie d'abord, puis par catégorie (position),
 * chaque thread / post rangé juste sous son salon parent.
 */
export function orderChannels(
  channels: ApiChannel[],
  threads: ApiChannel[],
  opts: { types?: number[]; withThreads?: boolean } = {},
): ChannelEntry[] {
  const types = opts.types ?? WEBHOOK_TYPES;
  const byPos = (a: ApiChannel, b: ApiChannel) => (a.position ?? 0) - (b.position ?? 0) || a.id.localeCompare(b.id);
  const cats = channels.filter((c) => c.type === 4).sort(byPos);
  const usable = channels.filter((c) => types.includes(c.type)).sort(byPos);
  const out: ChannelEntry[] = [];
  const pushWithThreads = (c: ApiChannel, group: string) => {
    out.push({ channel: c, group, indent: 0 });
    if (!opts.withThreads) return;
    threads
      .filter((th) => th.parent_id === c.id)
      .sort((a, b) => (b.id > a.id ? 1 : -1))
      .forEach((th) => out.push({ channel: th, group, indent: 1 }));
  };
  usable.filter((c) => !c.parent_id || !cats.some((k) => k.id === c.parent_id)).forEach((c) => pushWithThreads(c, ''));
  cats.forEach((k) => usable.filter((c) => c.parent_id === k.id).forEach((c) => pushWithThreads(c, k.name ?? 'Catégorie')));
  return out;
}

export function findChannel(channels: ApiChannel[], threads: ApiChannel[], id: string | null) {
  if (!id) return undefined;
  return channels.find((c) => c.id === id) ?? threads.find((c) => c.id === id);
}
