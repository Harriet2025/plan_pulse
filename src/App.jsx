import { Suspense, lazy, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useApp } from './context/AppContext';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import BottomNav from './components/BottomNav';
import Dashboard from './components/Dashboard';
import AppStatus from './components/AppStatus';
import AuthScreen from './components/AuthScreen';
import ErrorBoundary from './components/ErrorBoundary';

// The dashboard comes with the first download; everything else is its own small file, fetched quietly right after
// sign-in (so opening a section stays instant) and kept by the browser between visits.
const LOADERS = {
  planner: () => import('./components/PlannerView'), partners: () => import('./components/PartnersView'),
  journal: () => import('./components/JournalView'), calendar: () => import('./components/CalendarView'),
  catchup: () => import('./components/CatchUpView'), categories: () => import('./components/CategoriesView'),
  history: () => import('./components/HistoryView'), settings: () => import('./components/SettingsView'),
  goalPage: () => import('./components/GoalPage'), windDown: () => import('./components/WindDown'),
  newGoal: () => import('./components/NewGoalModal'), next: () => import('./components/NextTaskModal'),
  week: () => import('./components/WeeklyPlan'), reflect: () => import('./components/ReflectionModal'),
  lighten: () => import('./components/LightenModal'), reward: () => import('./components/RewardModal'),
  focus: () => import('./components/FocusTimer'),
};
const L = Object.fromEntries(Object.entries(LOADERS).map(([k, f]) => [k, lazy(f)]));
const VIEWS = { active: Dashboard, planner: L.planner, partners: L.partners, journal: L.journal, calendar: L.calendar, catchup: L.catchup, categories: L.categories, history: L.history, settings: L.settings };
const GoalPage = L.goalPage, WindDown = L.windDown, NewGoalModal = L.newGoal, NextTaskModal = L.next, WeeklyPlanModal = L.week;
const ReflectionModal = L.reflect, LightenModal = L.lighten, RewardModal = L.reward, FocusTimer = L.focus;

/** What shows for the moment a section is still arriving: the page's outline, never a blank screen. */
function PageLoading() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading">
      <div className="h-36 animate-pulse rounded-3xl bg-oat/60 motion-reduce:animate-none" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-48 animate-pulse rounded-3xl bg-oat/50 motion-reduce:animate-none" />
        <div className="h-48 animate-pulse rounded-3xl bg-oat/50 motion-reduce:animate-none" />
      </div>
    </div>
  );
}

// The emailed reset link looks like  https://the-site/#reset=<token hash>, from the template in Supabase's Auth settings
const readResetToken = () => /^#reset=([0-9a-f]{40,128})$/i.exec(window.location.hash)?.[1]?.toLowerCase() ?? null;

export default function App() {
  const { booted, user, view, goalPage, windDown, goalModal, lighten, rewardQueue, toastMsg, dismissToast, reflectGoal, nextOpen, focus, weekPlanOpen } = useApp();
  const [resetToken, setResetToken] = useState(readResetToken);
  const finishReset = () => { window.history.replaceState(null, '', window.location.pathname + window.location.search); setResetToken(null); };

  if (!booted) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-ivory">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-oat border-t-rust motion-reduce:animate-none" />
          <p className="mt-4 text-sm text-muted">Loading AuraGoal…</p>
        </div>
      </div>
    );
  }
  if (!user || resetToken) return <AuthScreen resetToken={resetToken} onResetDone={finishReset} />;
  return <SignedIn />;
}

function SignedIn() {
  const { view, goalPage, windDown, goalModal, lighten, rewardQueue, toastMsg, dismissToast, reflectGoal, nextOpen, focus, weekPlanOpen } = useApp();
  // Fetch the other sections while the browser is idle, so they open instantly later
  useEffect(() => {
    const go = () => Object.values(LOADERS).forEach((f) => f().catch(() => {}));
    const id = 'requestIdleCallback' in window ? window.requestIdleCallback(go, { timeout: 2500 }) : setTimeout(go, 1200);
    return () => ('cancelIdleCallback' in window ? window.cancelIdleCallback(id) : clearTimeout(id));
  }, []);

  const View = VIEWS[view];
  return (
    <div className="aura-bg relative isolate min-h-screen">
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="min-w-0 flex-1">
          <TopBar />
          <main className="mx-auto w-full max-w-[1600px] px-3 pb-28 pt-4 md:px-6 md:pb-10 md:pt-6">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={goalPage ? `page-${goalPage.kind}-${goalPage.id}` : view} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
                <ErrorBoundary resetKey={goalPage ? `p${goalPage.id}` : view}>
                  <Suspense fallback={<PageLoading />}>{goalPage ? <GoalPage /> : <View />}</Suspense>
                </ErrorBoundary>
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>

      <BottomNav />
      <AppStatus />

      <ErrorBoundary quiet><Suspense fallback={null}>
      <AnimatePresence>{goalModal && <NewGoalModal key="goal" />}</AnimatePresence>
      <AnimatePresence>{lighten && <LightenModal key="lighten" />}</AnimatePresence>
      <AnimatePresence>{reflectGoal && <ReflectionModal key={`reflect-${reflectGoal}`} />}</AnimatePresence>
      <AnimatePresence>{nextOpen && <NextTaskModal key="next" />}</AnimatePresence>
      <AnimatePresence>{weekPlanOpen && <WeeklyPlanModal key="week" />}</AnimatePresence>
      <AnimatePresence>{windDown && <WindDown key="wind" />}</AnimatePresence>
      <AnimatePresence>{focus && <FocusTimer key={`focus-${focus.id}`} />}</AnimatePresence>
      <AnimatePresence mode="wait">{rewardQueue[0] && <RewardModal key={rewardQueue[0].id} item={rewardQueue[0]} />}</AnimatePresence>
      </Suspense></ErrorBoundary>

      <AnimatePresence>
        {toastMsg && (
          <motion.div
            key={toastMsg.id} role="status" initial={{ opacity: 0, y: -12, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: -12, x: '-50%' }}
            className="fixed left-1/2 top-4 z-[80] flex w-max max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl border border-oat bg-soft py-2 pl-4 pr-2 text-sm font-semibold text-charcoal shadow-lg"
            style={{ boxShadow: '0 10px 30px -12px rgba(21,27,44,.35)' }}
          >
            <span className="min-w-0">{toastMsg.msg}</span>
            {toastMsg.action ? (
              <button type="button" onClick={() => { dismissToast(); toastMsg.action.onClick(); }} className="shrink-0 rounded-full bg-rust px-3.5 py-1.5 text-xs font-extrabold text-white hover:bg-rust-strong">
                {toastMsg.action.label}
              </button>
            ) : <span className="w-2 shrink-0" />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
