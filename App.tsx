import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SettingsProvider, useSettings } from './src/state/settings';
import { EditorProvider, useEditor } from './src/state/editor';
import { ToastProvider, useToast } from './src/components/ui';
import { SessionProvider } from './src/state/session';
import { BotGatewayProvider } from './src/state/botGateway';
import { LibraryProvider } from './src/state/library';
import { HomeScreen } from './src/screens/HomeScreen';
import { AlertHost } from './src/components/AlertHost';

function AutoRunToast({ children }: { children: React.ReactNode }) {
  const toast = useToast();
  return (
    <LibraryProvider onAutoRun={(n) => toast(`${n} automatisation(s) exécutée(s).`, 'success')}>{children}</LibraryProvider>
  );
}

function Root({ onRestored }: { onRestored: () => void }) {
  const { theme, base, ready } = useSettings();
  const editor = useEditor();
  useEffect(() => {
    // Fond natif (barre de navigation, transitions) assorti au thème choisi.
    SystemUI.setBackgroundColorAsync(base.bg).catch(() => {});
  }, [base.bg]);
  if (!ready || !editor.ready) {
    return (
      <View style={{ flex: 1, backgroundColor: base.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.accent} size="large" />
      </View>
    );
  }
  return (
    <ToastProvider>
      <SessionProvider>
        <BotGatewayProvider>
          <AutoRunToast>
            <StatusBar style={theme.dark ? 'light' : 'dark'} />
            <HomeScreen onRestored={onRestored} />
            <AlertHost />
          </AutoRunToast>
        </BotGatewayProvider>
      </SessionProvider>
    </ToastProvider>
  );
}

export default function App() {
  // Changer la clé remonte tous les providers : ils relisent le stockage (après restauration d'un backup).
  const [generation, setGeneration] = useState(0);
  return (
    <SafeAreaProvider>
      <SettingsProvider key={`s${generation}`}>
        <EditorProvider>
          <Root onRestored={() => setGeneration((g) => g + 1)} />
        </EditorProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
