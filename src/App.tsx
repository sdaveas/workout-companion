import { useEffect } from 'react';
import { useHashRoute } from './hooks/useHashRoute';
import { ActiveWorkout } from './screens/ActiveWorkout';
import { AddShared } from './screens/AddShared';
import { Credits } from './screens/Credits';
import { History } from './screens/History';
import { Home } from './screens/Home';
import { Programs } from './screens/Programs';
import { Settings } from './screens/Settings';
import { Summary } from './screens/Summary';
import { usePrograms } from './store/programsStore';
import { useSession } from './store/sessionStore';

export function App() {
  const route = useHashRoute();
  const load = usePrograms((s) => s.load);
  const recover = useSession((s) => s.recover);
  const restoring = useSession((s) => s.restoring);

  useEffect(() => {
    void load();
    void recover();
  }, [load, recover]);

  if (restoring) return <div className="min-h-dvh bg-ink" />;

  return (
    <div className="min-h-dvh bg-ink text-[15px]">
      {route.name === 'programs' && <Programs />}
      {route.name === 'add' && <AddShared payload={route.param ?? ''} />}
      {route.name === 'session' && <ActiveWorkout />}
      {route.name === 'summary' && <Summary />}
      {route.name === 'history' && <History />}
      {route.name === 'settings' && <Settings />}
      {route.name === 'credits' && <Credits />}
      {(route.name === 'home' || route.name === '') && <Home />}
    </div>
  );
}
