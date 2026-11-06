import { useEffect, useState } from 'react';

export interface Route {
  name: string;
  param: string | null;
}

function parse(hash: string): Route {
  const [name = '', param = null] = hash.replace(/^#\/?/, '').split('/');
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
