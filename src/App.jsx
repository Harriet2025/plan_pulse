import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useApp } from './context/AppContext';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import BottomNav from './components/BottomNav';
import Dashboard from './components/Dashboard';
import CategoriesView from './components/CategoriesView';
import HistoryView from './components/HistoryView';
import SettingsView from './components/SettingsView';
import CalendarView from './components/CalendarView';
import CatchUpView from './components/CatchUpView';
import PlannerView from './components/PlannerView';
import PartnersView from './components/PartnersView';
import JournalView from './components/JournalView';
import ReflectionModal from './components/ReflectionModal';
import NextTaskModal from './components/NextTaskModal';
import FocusTimer from './components/FocusTimer';
import AppStatus from './components/AppStatus';
import NewGoalModal from './components/NewGoalModal';
import LightenModal from './components/LightenModal';
import RewardModal from './components/RewardModal';
import AuthScreen from './components/AuthScreen';

const VIEWS = { active: Dashboard, planner: PlannerView, partners: PartnersView, journal: JournalView, calendar: CalendarView, catchup: CatchUpView, categories: CategoriesView, history: HistoryView, settings: SettingsView };

// The emailed reset link looks like  http://localhost:5173/#reset=<64 hex characters>
const readResetToken = () => /^#reset=([0-9a-f]{64})$/i.exec(window.location.hash)?.[1]?.toLowerCase() ?? null;

export default function App() {
  const { booted, user, view, goalModal, lighten, rewardQueue, toastMsg, dismissToast, reflectGoal, nextOpen, focus } = useApp();
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

  const View = VIEWS[view];
  return (
    <div className="aura-bg relative isolate min-h-screen">
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="min-w-0 flex-1">
          <TopBar />
          <main className="mx-auto w-full max-w-[1600px] px-4 pb-28 pt-6 md:px-6 md:pb-10">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={view} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
                <View />
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>

      <BottomNav />
      <AppStatus />

      <AnimatePresence>{goalModal && <NewGoalModal key="goal" />}</AnimatePresence>
      <AnimatePresence>{lighten && <LightenModal key="lighten" />}</AnimatePresence>
      <AnimatePresence>{reflectGoal && <ReflectionModal key={`reflect-${reflectGoal}`} />}</AnimatePresence>
      <AnimatePresence>{nextOpen && <NextTaskModal key="next" />}</AnimatePresence>
      <AnimatePresence>{focus && <FocusTimer key={`focus-${focus.id}`} />}</AnimatePresence>
      <AnimatePresence mode="wait">{rewardQueue[0] && <RewardModal key={rewardQueue[0].id} item={rewardQueue[0]} />}</AnimatePresence>

      <AnimatePresence>
        {toastMsg && (
          <motion.div
            key={toastMsg.id} role="status" initial={{ opacity: 0, y: -12, x: '-50%' }} animate={{ opacity: 1, y: 0, x: '-50%' }} exit={{ opacity: 0, y: -12, x: '-50%' }}
            className="fixed left-1/2 top-4 z-[80] flex w-max max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl border border-oat bg-soft py-2 pl-4 pr-2 text-sm font-semibold text-charcoal shadow-lg"
            style={{ boxShadow: '0 10px 30px -12px rgba(53,45,41,.35)' }}
          >
            <span className="min-w-0">{toastMsg.msg}</span>
            {toastMsg.action ? (
              <button type="button" onClick={() => { dismissToast(); toastMsg.action.onClick(); }} className="shrink-0 rounded-full bg-rust px-3.5 py-1.5 text-xs font-extrabold text-white hover:bg-rust-dark">
                {toastMsg.action.label}
              </button>
            ) : <span className="w-2 shrink-0" />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
