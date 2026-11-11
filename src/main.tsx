import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { parkSharedText } from './lib/device';
import './index.css';

parkSharedText();

// Ask the browser to keep IndexedDB out of eviction (iOS honours this for installed PWAs).
// ponytail: best-effort; if it is refused, History → Export is the backup path.
void navigator.storage?.persist?.().catch(() => {});

// The generated SW updates itself (skipWaiting + clientsClaim), but the open page keeps
// running the old bundle until something reloads it. Reload once when a new SW takes over,
// so a deploy reaches the phone instead of waiting for the user to close the tab.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) location.reload();
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
