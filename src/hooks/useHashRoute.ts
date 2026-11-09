import { useEffect, useState } from 'react';

export interface Route {
  name: string;
  param: string | null;
}

function parse(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  // A program carried in a link is raw json, and json holds slashes: keep it whole.
  if (path.startsWith('p/')) return { name: 'p', param: path.slice(2) };
  const [name = '', param = null] = path.split('/');
  return { name: name || 'home', param };
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState(() => parse(location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parse(location.hash));
    addEventListener('hashchange', onChange);
    return () => removeEventListener('hashchange', onChange);
  }, []);

  return route;
}

export function navigate(path: string): void {
  location.hash = path;
}
