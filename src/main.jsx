import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import { AppProvider } from './context/AppContext';
import App from './App';
import './index.css';

// The service worker makes AuraGoal installable, opens it quickly, shows an offline page, and shows push reminders
// (see public/sw.js). A new version waits until the user chooses to update (an "Update" message in the app).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      const offer = (worker) => window.dispatchEvent(new CustomEvent('auragoal:update', { detail: worker }));
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => { if (worker.state === 'installed' && navigator.serviceWorker.controller) offer(worker); });
      });
      // Look for a new version now and then, for people who keep the app open for days
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    } catch { /* the app still works; it just cannot be installed or notify */ }
  });
  // Once the user accepts an update and the new version takes over, load it
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (window.__auragoalUpdating && !reloading) { reloading = true; window.location.reload(); } });
}

// The browser's "install this app" offer (Chrome, Edge, Android) arrives early: keep it for the Install button
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__auragoalInstall = e;
  window.dispatchEvent(new Event('auragoal:installable'));
});
window.addEventListener('appinstalled', () => { window.__auragoalInstall = null; window.dispatchEvent(new Event('auragoal:installed')); });

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* "user" turns off movement animations for people who prefer reduced motion */}
    <MotionConfig reducedMotion="user">
      <AppProvider>
        <App />
      </AppProvider>
    </MotionConfig>
  </StrictMode>,
);
