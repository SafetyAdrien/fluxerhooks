import { useEffect, useState } from 'react';
import { resolveEndpoints, type Endpoints } from '../api/fluxer';
import { useSettings } from './settings';

const FALLBACK: Endpoints = {
  api: 'https://api.fluxer.app',
  media: 'https://fluxerusercontent.com',
  webapp: 'https://web.fluxer.app',
};

/** Points d'accès de l'instance configurée (découverts via .well-known/fluxer). */
export function useEndpoints(): Endpoints {
  const { settings } = useSettings();
  const [ep, setEp] = useState<Endpoints>(FALLBACK);
  useEffect(() => {
    let alive = true;
    resolveEndpoints(settings.instance).then((e) => alive && setEp(e));
    return () => {
      alive = false;
    };
  }, [settings.instance]);
  return ep;
}

/** Version impérative pour les actions (envoi, etc.). */
export const getEndpoints = (instance: string) => resolveEndpoints(instance);
