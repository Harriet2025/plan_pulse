import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, BellRing, Check, Eye, EyeOff, LayoutDashboard, ListChecks, Mail, RefreshCw, TriangleAlert, Trophy } from 'lucide-react';
import * as api from '../api';
import { useApp } from '../context/AppContext';
import { LinenTexture, Logo, cardShadow } from './ui';

const label = 'mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted';
const PERKS = [
  [LayoutDashboard, 'Your own dashboard', 'A private workspace for school, work, church and life.'],
  [ListChecks, 'Plans that break down', 'Split any goal into tasks and watch the progress bar fill.'],
  [BellRing, 'Reminders that find you', 'Set a time on any task and get notified when it is due.'],
  [Trophy, 'Streaks and badges', 'Earn Bronze, Silver and Gold as you get things done.'],
];

const COPY = {
  signup: ['Create your account', 'Start tracking your goals in a minute.'],
  login: ['Welcome back', 'Sign in to see your goals.'],
  forgot: ['Forgot your password?', "Enter your email and we'll send you a link to choose a new one."],
  reset: ['Choose a new password', 'Pick something you have not used before. At least 8 characters.'],
};

// mode: signup | login | forgot | reset.  resetToken comes from the emailed link (#reset=...).
export default function AuthScreen({ resetToken = null, onResetDone }) {
  const { signIn, bootError, boot, user, toast } = useApp();   // `user` is set when someone who is already signed in opens a reset link
  const [mode, setMode] = useState(() => {
    if (resetToken) return 'reset';
    try { return localStorage.getItem('auragoal.hasAccount') ? 'login' : 'signup'; } catch { return 'signup'; }
  });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');   // green message, e.g. "link sent" or "password changed"
  const [sent, setSent] = useState(false);    // forgot flow: the request went through
  const [busy, setBusy] = useState(false);
  const signup = mode === 'signup';
  const [title, subtitle] = COPY[mode];

  const go = (next) => { setMode(next); setError(''); setNotice(''); setSent(false); setPassword(''); setAgain(''); };

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setNotice('');

    if (mode === 'forgot') {
      if (!email.trim()) { setError('Enter your email address.'); return; }
      setBusy(true);
      try { await api.requestPasswordReset(email.trim()); setSent(true); } catch (ex) { setError(ex.message); }
      setBusy(false);
      return;
    }

    if (mode === 'reset') {
      if (password.length < 8 || password.length > 72) { setError('Your password must be 8 to 72 characters.'); return; }
      if (password !== again) { setError('The two passwords do not match.'); return; }
      setBusy(true);
      try {
        const msg = await api.resetPassword(resetToken, password);
        onResetDone?.();
        if (user) toast(msg);   // already signed in: they land back in the app, so say it there
        go('login');
        setNotice(msg);
      } catch (ex) { setError(ex.message); }
      setBusy(false);
      return;
    }

    if (!email.trim() || !password || (signup && !name.trim())) { setError('Fill in every field.'); return; }
    setBusy(true);
    try {
      await signIn(mode, { display_name: name, email, password });
      try { localStorage.setItem('auragoal.hasAccount', '1'); } catch { /* ignore */ }
    } catch (ex) {
      setError(ex.message); setBusy(false);
    }
  };

  const buttonText = { signup: 'Create account', login: 'Sign in', forgot: 'Send reset link', reset: 'Set new password' }[mode];
  const busyText = { signup: 'Creating…', login: 'Signing in…', forgot: 'Sending…', reset: 'Saving…' }[mode];

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-ivory">
      <div className="mx-auto flex min-h-full w-full max-w-5xl items-center px-4 py-8 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
          className="grid w-full overflow-hidden rounded-[28px] border border-oat bg-soft lg:grid-cols-[1fr_1.05fr]" style={cardShadow}
        >
          {/* Brand panel: everything on it is pure white, the only white that keeps 4.5:1 on rust */}
          <section className="relative flex flex-col gap-6 overflow-hidden bg-rust p-6 text-white sm:p-8 lg:justify-between lg:gap-10 lg:p-10">
            <LinenTexture />
            <div className="relative"><Logo onDark size="h-10 w-10" icon="h-5 w-5" text="text-xl" /></div>

            <div className="relative">
              <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-white lg:text-4xl">
                Your goals. Your plan.<br className="hidden lg:block" /> Your pace.
              </h1>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-white lg:hidden">Plan goals, break them into tasks and keep your streak going.</p>
            </div>

            <ul className="relative hidden gap-4 lg:grid">
              {PERKS.map(([Icon, head, body]) => (
                <li key={head} className="flex gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/15"><Icon className="h-[18px] w-[18px] text-white" aria-hidden="true" /></span>
                  <span className="text-sm leading-snug text-white"><b className="block font-extrabold">{head}</b>{body}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Form panel */}
          <form onSubmit={submit} noValidate aria-labelledby="authTitle" className="p-6 sm:p-8 lg:p-10">
            {bootError && (
              <div className="mb-5 flex gap-3 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-charcoal" role="alert">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                <div className="min-w-0">
                  <p>{bootError}</p>
                  <button type="button" onClick={boot} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-warning/40 bg-soft px-2.5 py-1 text-xs font-bold text-warning hover:bg-warning/10">
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />Try again
                  </button>
                </div>
              </div>
            )}

            {(mode === 'forgot' || mode === 'reset') && (
              <button type="button" onClick={() => (user ? onResetDone?.() : go('login'))} className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-rust-dark hover:underline">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />{user ? 'Back to the app' : 'Back to sign in'}
              </button>
            )}

            <h2 id="authTitle" className="text-2xl font-extrabold tracking-tight text-charcoal">{title}</h2>
            <p className="mt-1 text-sm text-muted">{subtitle}</p>

            {notice && mode !== 'forgot' && (
              <p className="mt-4 flex items-start gap-2 rounded-xl border border-success/40 bg-success/10 px-3 py-2 text-sm text-success" role="status">
                <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{notice}
              </p>
            )}

            {(mode === 'login' || mode === 'signup') && (
              <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl border border-oat bg-ivory p-1" role="group" aria-label="Account">
                {[['login', 'Sign in'], ['signup', 'Create account']].map(([m, text]) => (
                  <button key={m} type="button" aria-pressed={mode === m} onClick={() => go(m)} className="seg-btn rounded-lg py-2 text-sm font-bold">{text}</button>
                ))}
              </div>
            )}

            {mode === 'forgot' && sent ? (
              <div className="mt-6 rounded-2xl border border-success/40 bg-success/10 p-4 text-sm text-charcoal" role="status">
                <span className="mb-2 grid h-9 w-9 place-items-center rounded-xl bg-success text-white"><Mail className="h-[18px] w-[18px]" aria-hidden="true" /></span>
                <p className="font-bold">Check your inbox</p>
                <p className="mt-1 text-muted">If an account uses <b className="text-charcoal">{email.trim()}</b>, a reset link is on its way. It works once and expires in 60 minutes. Look in spam if you don't see it.</p>
                <button type="button" onClick={() => go('login')} className="mt-3 text-sm font-bold text-rust-dark hover:underline">Back to sign in</button>
              </div>
            ) : (
              <>
                <div className="mt-5 grid gap-4">
                  <AnimatePresence initial={false}>
                    {signup && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="-mx-1 overflow-hidden px-1">
                        <label htmlFor="authName" className={label}>Your name</label>
                        <input id="authName" className="field" type="text" maxLength={100} autoComplete="name" placeholder="e.g. Harriet" value={name} onChange={(e) => setName(e.target.value)} />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {mode !== 'reset' && (
                    <div>
                      <label htmlFor="authEmail" className={label}>Email</label>
                      <input id="authEmail" className="field" type="email" maxLength={255} autoComplete="email" inputMode="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
                    </div>
                  )}

                  {mode !== 'forgot' && (
                    <div>
                      <div className="flex items-baseline justify-between">
                        <label htmlFor="authPass" className={label}>{mode === 'reset' ? 'New password' : 'Password'}</label>
                        {mode === 'login' && <button type="button" onClick={() => go('forgot')} className="mb-1.5 text-xs font-bold text-rust-dark hover:underline">Forgot password?</button>}
                      </div>
                      <div className="relative">
                        <input id="authPass" className="field !pr-11" type={show ? 'text' : 'password'} maxLength={72} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} autoFocus={mode === 'reset'} />
                        <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}
                          className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-muted hover:text-charcoal">
                          {show ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                        </button>
                      </div>
                      {signup && <p className="mt-1.5 text-xs text-muted">Use at least 8 characters.</p>}
                    </div>
                  )}

                  {mode === 'reset' && (
                    <div>
                      <label htmlFor="authAgain" className={label}>Repeat new password</label>
                      <input id="authAgain" className="field" type={show ? 'text' : 'password'} maxLength={72} autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
                    </div>
                  )}
                </div>

                {error && (
                  <p className="mt-4 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
                    {error}
                    {mode === 'reset' && !user && /invalid|expired/i.test(error) && (
                      <> <button type="button" onClick={() => { onResetDone?.(); go('forgot'); }} className="font-bold underline">Ask for a new link</button></>
                    )}
                  </p>
                )}

                <button type="submit" disabled={busy} className="mt-6 w-full rounded-xl bg-rust py-3 text-sm font-extrabold text-white hover:bg-rust-dark active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-60">
                  {busy ? busyText : buttonText}
                </button>
              </>
            )}

            <p className="mt-4 text-center text-xs text-muted">Your goals stay private to your account.</p>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
