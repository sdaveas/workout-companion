import { useEffect, useState } from 'react';

export interface Route {
  name: string;
  param: string | null;
  /** Anything after the param, e.g. `build/<id>` → ['<id>']. */
  rest: string[];
}

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  // A program carried in a link is raw json, and json holds slashes: keep it whole.
  if (path.startsWith('p/')) return { name: 'p', param: path.slice(2), rest: [] };
  const [name = '', param = null, ...rest] = path.split('/');
  return { name: name || 'home', param, rest };
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash));

  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash(location.hash));
      // A hash change keeps the old scroll offset; a new screen should open at its top.
      scrollTo(0, 0);
    };
    addEventListener('hashchange', onChange);
    return () => removeEventListener('hashchange', onChange);
  }, []);

  return route;
}

export function navigate(path: string): void {
  location.hash = path;
}
