import { useEffect } from 'react';
import { useHashRoute } from './hooks/useHashRoute';
import { ActiveWorkout } from './screens/ActiveWorkout';
import { AddShared } from './screens/AddShared';
import { Credits } from './screens/Credits';
import { DriveSpike } from './screens/DriveSpike';
import { History } from './screens/History';
import { Home } from './screens/Home';
import { PasteProgram } from './screens/PasteProgram';
import { ProgramDetail } from './screens/ProgramDetail';
import { Programs } from './screens/Programs';
import { Settings } from './screens/Settings';
import { Summary } from './screens/Summary';
import { decodeLinkPayload } from './lib/programLink';
import { usePrograms } from './store/programsStore';
import { useSession } from './store/sessionStore';
import { ScreenHeader } from './components/ui/ScreenHeader';

const KNOWN = new Set([
  'programs',
  'add',
  'paste',
  'p',
  'program',
  'session',
  'summary',
  'history',
  'settings',
  'credits',
  'drive-spike',
]);

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
      {route.name === 'paste' && <PasteProgram />}
      {route.name === 'p' && <PasteProgram initial={decodeLinkPayload(route.param ?? '')} />}
      {route.name === 'program' && <ProgramDetail id={route.param ?? ''} />}
      {route.name === 'session' && <ActiveWorkout />}
      {route.name === 'summary' && <Summary />}
      {route.name === 'history' && <History />}
      {route.name === 'settings' && <Settings />}
      {route.name === 'credits' && <Credits />}
      {route.name === 'drive-spike' && <DriveSpike />}
      {(route.name === 'home' || route.name === '') && <Home />}
      {!KNOWN.has(route.name) && route.name !== 'home' && (
        <main className="mx-auto max-w-md px-5 pt-[max(1.5rem,env(safe-area-inset-top))]">
          <ScreenHeader back={{ to: '#/', label: 'Home' }} />
          <p className="mt-16 text-center text-muted">That page is not here.</p>
          <div className="mt-4 text-center">
            <a href="#/" className="text-sm text-accent underline underline-offset-4">
              Back to Home
            </a>
          </div>
        </main>
      )}
    </div>
  );
}
