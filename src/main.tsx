import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

// Ask the browser to keep IndexedDB out of eviction (iOS honours this for installed PWAs).
// ponytail: best-effort; if it is refused, History → Export is the backup path.
void navigator.storage?.persist?.().catch(() => {});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
