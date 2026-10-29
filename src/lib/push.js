// Browser side of push notifications: asking permission, subscribing this device, and unsubscribing.

const FLAG = 'auragoal.push';

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
/** 'granted', 'denied', 'default' (not asked yet) or 'unsupported'. */
export const pushPermission = () => (pushSupported() ? Notification.permission : 'unsupported');

/** Remembers that this device gets pushes, so the page does not show the same reminder a second time. */
export const pushFlag = {
  get: () => { try { return localStorage.getItem(FLAG) === '1'; } catch { return false; } },
  set: (on) => { try { on ? localStorage.setItem(FLAG, '1') : localStorage.removeItem(FLAG); } catch { /* ignore */ } },
};

const toBytes = (b64) => {
  const raw = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const sameBytes = (a, b) => !!a && a.byteLength === b.byteLength && new Uint8Array(a).every((v, i) => v === b[i]);

async function registration() {
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => setTimeout(() => reject(new Error('The browser did not start the notification helper. Reload the page and try again.')), 6000)),
  ]);
  return reg;
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  try { return await (await registration()).pushManager.getSubscription(); } catch { return null; }
}

/** Asks permission, subscribes this device, and returns the subscription to hand to the server. */
export async function enablePush(vapidPublic) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(permission === 'denied'
      ? 'Notifications are blocked for this site. Allow them in your browser’s site settings, then try again.'
      : 'Permission was not given, so notifications stay off.');
  }
  const reg = await registration();
  const key = toBytes(vapidPublic);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameBytes(sub.options && sub.options.applicationServerKey, key)) { await sub.unsubscribe(); sub = null; }   // made for a different server key
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  return sub.toJSON();
}

/** Unsubscribes this device and returns its old address (so the server can forget it). */
export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return endpoint;
}

/** The first 16 hex characters of the SHA-256 of an address: how the server labels devices, so "this device" can be spotted. */
export async function endpointKey(endpoint) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}
