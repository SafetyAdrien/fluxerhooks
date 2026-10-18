import React, { useEffect, useState } from 'react';
import { Alert, Platform, Text, type AlertButton } from 'react-native';
import { useSettings } from '../state/settings';
import { tr } from '../i18n';
import { Button, Dialog, Stack } from './ui';

/**
 * Sur le web et le bureau, `Alert.alert` de React Native ne fait rien : les confirmations
 * (« Retirer ce compte ? », « Restaurer ce backup ? »…) sont affichées ici dans le style de l'app.
 */
interface Pending {
  id: number;
  title: string;
  message?: string;
  buttons: AlertButton[];
  cancelable: boolean;
}

let push: ((p: Omit<Pending, 'id'>) => void) | null = null;
let seq = 0;

if (Platform.OS === 'web') {
  (Alert as any).alert = (title: string, message?: string, buttons?: AlertButton[], options?: { cancelable?: boolean }) => {
    const list = buttons?.length ? buttons : [{ text: 'OK' }];
    push?.({ title, message, buttons: list, cancelable: options?.cancelable ?? list.some((b) => b.style === 'cancel') });
  };
} else {
  // Android : la boîte native reçoit les textes déjà traduits (titre, message, boutons).
  const native = Alert.alert.bind(Alert);
  (Alert as any).alert = (title: string, message?: string, buttons?: AlertButton[], options?: any) =>
    native(tr(title), message ? tr(message) : message, buttons?.map((b) => ({ ...b, text: b.text ? tr(b.text) : b.text })), options);
}

export function AlertHost() {
  const { theme: t } = useSettings();
  const [queue, setQueue] = useState<Pending[]>([]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    push = (p) => setQueue((q) => [...q, { ...p, id: ++seq }]);
    return () => {
      push = null;
    };
  }, []);
  const current = queue[0];
  if (!current) return null;
  const close = (b?: AlertButton) => {
    setQueue((q) => q.slice(1));
    b?.onPress?.();
  };
  const cancel = current.buttons.find((b) => b.style === 'cancel');
  const lastAction = [...current.buttons].reverse().find((b) => b.style !== 'cancel');
  return (
    <Dialog key={current.id} visible onClose={() => (current.cancelable ? close(cancel) : undefined)} title={current.title} maxWidth={420}>
      {!!current.message && <Text style={{ color: t.textMuted, fontSize: t.font(14), lineHeight: t.font(20) }}>{tr(current.message)}</Text>}
      <Stack row gap={8}>
        {current.buttons.map((b, i) => (
          <Button
            key={i}
            flex
            label={b.text ?? 'OK'}
            variant={b.style === 'destructive' ? 'danger' : b.style === 'cancel' ? 'secondary' : b === lastAction ? 'primary' : 'secondary'}
            onPress={() => close(b)}
          />
        ))}
      </Stack>
    </Dialog>
  );
}
