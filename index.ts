import { registerRootComponent } from 'expo';

// La tâche de fond doit être définie au chargement du bundle, avant le rendu.
import './src/state/backgroundTask';
import App from './App';

registerRootComponent(App);
