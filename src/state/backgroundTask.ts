import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import { runDueAutomations } from './automation';
import { desktop } from '../platform/desktop';

/**
 * Tâche de fond Android (WorkManager) : vérifie les automatisations échues.
 * Android décide du moment exact (au mieux toutes les ~15 min, plus rarement en économie d'énergie),
 * l'app rattrape aussi les envois en retard dès qu'elle est ouverte.
 */
export const AUTOMATION_TASK = 'fluxerhooks-automations';

try {
  TaskManager.defineTask(AUTOMATION_TASK, async () => {
    try {
      await runDueAutomations();
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
} catch {
  // Plateforme sans tâches de fond (web) : rien à faire.
}

export async function setBackgroundAutomations(enabled: boolean) {
  // Bureau : l'app reste dans la zone de notification à la fermeture et continue d'exécuter les automatisations.
  if (desktop) return desktop.setBackground(enabled).catch(() => {});
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(AUTOMATION_TASK);
    if (enabled && !registered) await BackgroundTask.registerTaskAsync(AUTOMATION_TASK, { minimumInterval: 15 });
    if (!enabled && registered) await BackgroundTask.unregisterTaskAsync(AUTOMATION_TASK);
  } catch {
    // Indisponible (web, Expo Go…) : les automatisations tournent quand l'app est ouverte.
  }
}
