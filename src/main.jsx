import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import { AppProvider } from './context/AppContext';
import App from './App';
import './index.css';

// The service worker shows push reminders when the site is closed (see public/sw.js)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => { /* notifications just stay unavailable */ }));
}

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
