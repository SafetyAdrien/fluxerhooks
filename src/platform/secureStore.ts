import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { desktop } from './desktop';

/**
 * Stockage des secrets (tokens) : Keystore sur Android, trousseau du système sur Linux (bureau),
 * mémoire de la session dans un simple navigateur.
 */
const memory = new Map<string, string>();

export async function getItemAsync(key: string): Promise<string | null> {
  if (desktop) return desktop.secret.get(key);
  if (Platform.OS === 'web') return memory.get(key) ?? null;
  return SecureStore.getItemAsync(key);
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  if (desktop) return desktop.secret.set(key, value);
  if (Platform.OS === 'web') {
    memory.set(key, value);
    return;
  }
  return SecureStore.setItemAsync(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  if (desktop) return desktop.secret.del(key);
  if (Platform.OS === 'web') {
    memory.delete(key);
    return;
  }
  return SecureStore.deleteItemAsync(key);
}
