import { useEffect } from 'react';
import { useHashRoute } from './hooks/useHashRoute';
import { ActiveWorkout } from './screens/ActiveWorkout';
import { History } from './screens/History';
import { Home } from './screens/Home';
import { Programs } from './screens/Programs';
import { Summary } from './screens/Summary';
import { usePrograms } from './store/programsStore';

export function App() {
  const route = useHashRoute();
  const load = usePrograms((s) => s.load);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-dvh bg-ink text-[15px]">
      {route.name === 'programs' && <Programs />}
      {route.name === 'session' && <ActiveWorkout />}
      {route.name === 'summary' && <Summary />}
      {route.name === 'history' && <History />}
      {(route.name === 'home' || route.name === '') && <Home />}
    </div>
  );
}
