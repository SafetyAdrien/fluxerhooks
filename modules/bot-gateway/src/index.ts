import { requireOptionalNativeModule } from 'expo';

export type GatewayStatus = 'offline' | 'connecting' | 'online' | 'reconnecting' | 'error';

export interface GatewayState {
  state: GatewayStatus;
  username?: string;
  userId?: string;
  guilds?: number;
  error?: string;
  code?: number;
  since?: number;
}

export interface StartOptions {
  token: string;
  url: string;
  status: string;
  text: string;
  appName: string;
}

interface NativeGateway {
  start(opts: StartOptions): Promise<void>;
  stop(): Promise<void>;
  setPresence(opts: { status: string; text: string }): Promise<void>;
  getState(): GatewayState;
  addListener(event: 'onState', cb: (s: GatewayState) => void): { remove(): void };
}

/** Service natif Android (null sur le web : repli WebSocket JavaScript, au premier plan seulement). */
export const BotGatewayNative = requireOptionalNativeModule<NativeGateway>('BotGateway');
