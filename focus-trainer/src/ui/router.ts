import { GAME_IDS, type GameId, type Mode } from '../core/types';

export type Route =
  | { name: 'home' }
  | { name: 'play'; gameId: GameId; mode: Mode }
  | { name: 'result'; sessionId: number }
  | { name: 'settings' };

function isGameId(s: string | undefined): s is GameId {
  return s !== undefined && (GAME_IDS as readonly string[]).includes(s);
}

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter((p) => p.length > 0);
  const [head, a, b] = parts;
  if (head === 'play' && parts.length === 3 && isGameId(a) && (b === 'plan' || b === 'free')) {
    return { name: 'play', gameId: a, mode: b };
  }
  if (head === 'result' && parts.length === 2 && /^\d+$/.test(a)) return { name: 'result', sessionId: Number(a) };
  if (head === 'settings' && parts.length === 1) return { name: 'settings' };
  return { name: 'home' };
}

export function href(r: Route): string {
  switch (r.name) {
    case 'home':
      return '#/';
    case 'play':
      return `#/play/${r.gameId}/${r.mode}`;
    case 'result':
      return `#/result/${r.sessionId}`;
    case 'settings':
      return '#/settings';
  }
}

export function navigate(r: Route, replace = false): void {
  const url = href(r);
  if (replace) {
    history.replaceState(null, '', url);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = url;
  }
}

export function startRouter(onRoute: (r: Route) => void): void {
  const fire = (): void => onRoute(parseRoute(location.hash));
  window.addEventListener('hashchange', fire);
  fire();
}
