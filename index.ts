import { registerRootComponent } from 'expo';

// Avant tout accès au stockage (app et tâche de fond) : suivi des modifications à synchroniser.
import './src/link/storageHook';

// La tâche de fond doit être définie au chargement du bundle, avant le rendu.
import './src/state/backgroundTask';
import App from './App';

registerRootComponent(App);
