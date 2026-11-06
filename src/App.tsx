import { useEffect } from 'react';
import { useHashRoute } from './hooks/useHashRoute';
import { Home } from './screens/Home';
import { Programs } from './screens/Programs';
import { usePrograms } from './store/programsStore';

export function App() {
  const route = useHashRoute();
  const load = usePrograms((s) => s.load);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-dvh bg-ink text-[15px]">
      {route.name === 'programs' ? <Programs /> : <Home />}
    </div>
  );
}
