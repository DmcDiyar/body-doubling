import { create } from 'zustand';
import type { Session, SessionParticipant, RealtimePresence } from '@/types/database';

interface SessionState {
  // Session data (DB'den gelir, UI asla kendi karar vermez)
  session: Session | null;
  myParticipation: SessionParticipant | null;
  partnerParticipation: SessionParticipant | null;

  // Realtime presence
  partnerPresence: RealtimePresence | null;

  // Timer (session.started_at'tan hesaplanır)
  timeRemaining: number; // seconds
  isTimerRunning: boolean;

  // Actions
  setSession: (session: Session | null) => void;
  setMyParticipation: (p: SessionParticipant | null) => void;
  setPartnerParticipation: (p: SessionParticipant | null) => void;
  setPartnerPresence: (p: RealtimePresence | null) => void;
  setTimeRemaining: (t: number) => void;
  setTimerRunning: (running: boolean) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  session: null,
  myParticipation: null,
  partnerParticipation: null,
  partnerPresence: null,
  timeRemaining: 0,
  isTimerRunning: false,

  setSession: (session) => set({ session }),
  setMyParticipation: (myParticipation) => set({ myParticipation }),
  setPartnerParticipation: (partnerParticipation) => set({ partnerParticipation }),
  setPartnerPresence: (partnerPresence) => set({ partnerPresence }),
  setTimeRemaining: (timeRemaining) => set({ timeRemaining }),
  setTimerRunning: (isTimerRunning) => set({ isTimerRunning }),
  reset: () =>
    set({
      session: null,
      myParticipation: null,
      partnerParticipation: null,
      partnerPresence: null,
      timeRemaining: 0,
      isTimerRunning: false,
    }),
}));
