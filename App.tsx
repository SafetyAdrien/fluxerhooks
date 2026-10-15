import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SettingsProvider, useSettings } from './src/state/settings';
import { EditorProvider, useEditor } from './src/state/editor';
import { ToastProvider } from './src/components/ui';
import { HomeScreen } from './src/screens/HomeScreen';

function Root() {
  const { theme, ready } = useSettings();
  const editor = useEditor();
  useEffect(() => {
    // Fond natif (barre de navigation, transitions) assorti au thème choisi.
    SystemUI.setBackgroundColorAsync(theme.bg).catch(() => {});
  }, [theme.bg]);
  if (!ready || !editor.ready) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.accent} size="large" />
      </View>
    );
  }
  return (
    <ToastProvider>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <HomeScreen />
    </ToastProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <EditorProvider>
          <Root />
        </EditorProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
