'use client';

import { Suspense, useEffect, useRef, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { useSessionStore } from '@/stores/session-store';
import { AVATARS, COPY, HEARTBEAT_INTERVAL_MS, THEMES } from '@/lib/constants';
import { motion, AnimatePresence } from 'framer-motion';
import type { Session, SessionParticipant, RealtimePresence, PresenceStatus } from '@/types/database';

export default function SessionActiveWrapper() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-b from-[#1a1a2e] via-[#16213e] to-[#0f3460] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#ffcb77]/30 border-t-[#ffcb77] rounded-full animate-spin" />
      </div>
    }>
      <SessionActivePage />
    </Suspense>
  );
}

function SessionActivePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('id');

  const {
    session,
    myParticipation,
    partnerParticipation,
    partnerPresence,
    timeRemaining,
    setSession,
    setMyParticipation,
    setPartnerParticipation,
    setPartnerPresence,
    setTimeRemaining,
    setTimerRunning,
    reset,
  } = useSessionStore();

  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [partnerLeft, setPartnerLeft] = useState(false);
  const [continuingAlone, setContinuingAlone] = useState(false);
  const [myPresenceStatus, setMyPresenceStatus] = useState<PresenceStatus>('active');
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const presenceChannelRef = useRef<any>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------- Load session data ----------
  useEffect(() => {
    if (!sessionId) return;

    const loadData = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/auth'); return; }
      setUserId(user.id);

      // Session verisini çek
      const { data: sessionData } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (!sessionData) { router.push('/dashboard'); return; }
      setSession(sessionData as Session);

      // Kendi participation'ımızı çek
      const { data: myPart } = await supabase
        .from('session_participants')
        .select('*')
        .eq('session_id', sessionId)
        .eq('user_id', user.id)
        .single();

      if (myPart) setMyParticipation(myPart as SessionParticipant);

      // Partner participation (duo ise)
      if ((sessionData as Session).mode === 'duo') {
        const { data: partnerPart } = await supabase
          .from('session_participants')
          .select('*')
          .eq('session_id', sessionId)
          .neq('user_id', user.id)
          .single();

        if (partnerPart) setPartnerParticipation(partnerPart as SessionParticipant);
      }

      setLoading(false);
    };

    loadData();
  }, [sessionId, router, setSession, setMyParticipation, setPartnerParticipation]);

  // ---------- Start session (waiting → active) ----------
  const startSession = useCallback(async () => {
    if (!sessionId || !userId) return;
    const supabase = createClient();
    const now = new Date().toISOString();

    // Session'ı active yap (maybeSingle: zaten active ise 0 satır döner, hata vermez)
    const { data: updatedSession } = await supabase
      .from('sessions')
      .update({ status: 'active', started_at: now })
      .eq('id', sessionId)
      .eq('status', 'waiting')
      .select('*')
      .maybeSingle();

    if (updatedSession) {
      setSession(updatedSession as Session);
    } else {
      // Zaten active olmuş olabilir — güncel halini çek
      const { data: currentSession } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .single();
      if (currentSession) setSession(currentSession as Session);
    }

    // Participation'ı active yap
    const { data: updatedPart } = await supabase
      .from('session_participants')
      .update({ status: 'active', joined_at: now })
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .eq('status', 'waiting')
      .select('*')
      .maybeSingle();

    if (updatedPart) {
      setMyParticipation(updatedPart as SessionParticipant);
    } else {
      // Zaten active — güncel halini çek
      const { data: currentPart } = await supabase
        .from('session_participants')
        .select('*')
        .eq('session_id', sessionId)
        .eq('user_id', userId)
        .single();
      if (currentPart) setMyParticipation(currentPart as SessionParticipant);
    }
  }, [sessionId, userId, setSession, setMyParticipation]);

  // ---------- Auto-start when ready ----------
  useEffect(() => {
    if (!session || !myParticipation || loading) return;

    if (session.status === 'waiting') {
      // Solo mode → hemen başla, Duo → partner da ready ise başla
      if (session.mode === 'solo') {
        startSession();
      } else if (partnerParticipation) {
        startSession();
      }
    }
  }, [session, myParticipation, partnerParticipation, loading, startSession]);

  // ---------- Timer ----------
  useEffect(() => {
    if (!session || session.status !== 'active' || !session.started_at) return;

    const durationSec = session.duration * 60;
    const startedAt = new Date(session.started_at).getTime();

    const tick = () => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const remaining = Math.max(0, durationSec - elapsed);
      setTimeRemaining(remaining);

      if (remaining <= 0) {
        // Süre doldu → complete
        handleSessionComplete();
      }
    };

    tick();
    setTimerRunning(true);
    timerRef.current = setInterval(tick, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      setTimerRunning(false);
    };
  }, [session?.status, session?.started_at, session?.duration]);

  // ---------- Realtime presence (Supabase Channels) ----------
  useEffect(() => {
    if (!sessionId || !userId || !session || session.status !== 'active') return;

    const supabase = createClient();
    const channel = supabase.channel(`session:${sessionId}`, {
      config: { presence: { key: userId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        // Partner'ı bul
        for (const key of Object.keys(state)) {
          if (key !== userId) {
            const presence = state[key]?.[0] as unknown as RealtimePresence | undefined;
            if (presence) setPartnerPresence(presence);
          }
        }
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        if (key !== userId) {
          setPartnerPresence(null);
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Kendi presence'ımızı gönder
          const { data: myUser } = await supabase
            .from('users')
            .select('avatar_id, name')
            .eq('id', userId)
            .single();

          channel.track({
            user_id: userId,
            avatar_id: myUser?.avatar_id ?? 1,
            name: myUser?.name ?? 'Anonim',
            status: 'active',
            session_goal: myParticipation?.session_goal ?? '',
            last_heartbeat: Date.now(),
          } satisfies RealtimePresence);
        }
      });

    presenceChannelRef.current = channel;

    // Heartbeat interval — presence durumunu güncelle
    heartbeatRef.current = setInterval(() => {
      if (presenceChannelRef.current) {
        presenceChannelRef.current.track({
          user_id: userId,
          avatar_id: 1,
          name: '',
          status: myPresenceStatus,
          session_goal: myParticipation?.session_goal ?? '',
          last_heartbeat: Date.now(),
        } satisfies RealtimePresence);
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      channel.unsubscribe();
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [sessionId, userId, session?.status]);

  // ---------- Realtime session changes ----------
  useEffect(() => {
    if (!sessionId) return;
    const supabase = createClient();

    const channel = supabase
      .channel(`session-updates:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          setSession(payload.new as Session);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'session_participants',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const updated = payload.new as SessionParticipant;
          if (updated.user_id === userId) {
            setMyParticipation(updated);
          } else {
            setPartnerParticipation(updated);
          }
        }
      )
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [sessionId, userId]);

  // ---------- Idle detection ----------
  useEffect(() => {
    if (!session || session.status !== 'active') return;

    const resetIdle = () => {
      setMyPresenceStatus('active');
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        setMyPresenceStatus('idle');
      }, 60_000); // 1 dakika hareketsiz → idle
    };

    const events = ['mousemove', 'keydown', 'touchstart', 'scroll'];
    events.forEach((e) => window.addEventListener(e, resetIdle));
    resetIdle();

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetIdle));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [session?.status]);

  // ---------- Page visibility → away ----------
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        setMyPresenceStatus('away');
      } else {
        setMyPresenceStatus('active');
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // ---------- Session tamamlandığında yönlendir ----------
  useEffect(() => {
    if (session?.status === 'completed') {
      router.push(`/session/end?id=${sessionId}`);
    } else if (session?.status === 'abandoned') {
      reset();
      router.push('/dashboard');
    }
  }, [session?.status, sessionId, router, reset]);

  // ---------- Partner left detection (duo) ----------
  useEffect(() => {
    if (session?.mode === 'duo' && partnerParticipation?.status === 'left_early' && !continuingAlone) {
      setPartnerLeft(true);
    }
  }, [session?.mode, partnerParticipation?.status, continuingAlone]);

  // ---------- Handlers ----------
  const handleSessionComplete = async () => {
    if (!sessionId || !userId) return;
    const supabase = createClient();

    // RPC ile session'ı tamamla (trust, xp, streak hesaplanır)
    await supabase.rpc('complete_session', {
      p_session_id: sessionId,
      p_user_id: userId,
    });
  };

  const handleEarlyExit = async () => {
    if (!sessionId || !userId || !session) return;
    const supabase = createClient();

    // Calculate elapsed minutes
    const totalDuration = session.duration;
    const elapsedSeconds = (session.duration * 60) - timeRemaining;
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);

    // Queue cleanup - kullanıcı session'dan çıkınca kuyruktan da temizle
    await supabase.from('matching_queue').delete().eq('user_id', userId);

    // RPC ile erken çıkışı işle (trust penalty)
    await supabase.rpc('handle_early_exit', {
      p_session_id: sessionId,
      p_user_id: userId,
      p_elapsed_minutes: elapsedMinutes,
      p_total_duration: totalDuration,
    });

    // Presence'tan çık
    if (presenceChannelRef.current) {
      presenceChannelRef.current.unsubscribe();
    }
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);

    reset();
    router.push('/dashboard');
  };

  // ---------- Solo/safe exit (no trust penalty) ----------
  // Solo mode çıkışı tamamen nötr: trust cezası yok, uyarı yok
  const handleSoloExit = async () => {
    if (!sessionId || !userId) return;
    const supabase = createClient();

    // Queue cleanup - solo exit'te de kuyruğu temizle
    await supabase.from('matching_queue').delete().eq('user_id', userId);

    await supabase
      .from('session_participants')
      .update({ status: 'completed', left_at: new Date().toISOString() })
      .eq('session_id', sessionId)
      .eq('user_id', userId);

    await supabase
      .from('sessions')
      .update({ status: 'completed', ended_at: new Date().toISOString() })
      .eq('id', sessionId);

    if (presenceChannelRef.current) presenceChannelRef.current.unsubscribe();
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);

    reset();
    router.push('/dashboard');
  };

  // ---------- Helpers ----------
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getThemeEmoji = (themeId: string) => {
    return THEMES.find((t) => t.id === themeId)?.emoji ?? '🌧️';
  };

  const getAvatar = (avatarId: number) => {
    return AVATARS.find((a) => a.id === avatarId)?.emoji ?? '🐱';
  };

  const getPartnerStatusText = (status: PresenceStatus) => {
    switch (status) {
      case 'active': return COPY.SESSION_PARTNER_ACTIVE;
      case 'idle': return COPY.SESSION_PARTNER_IDLE;
      case 'away': return COPY.SESSION_PARTNER_AWAY;
    }
  };

  const getPartnerStatusColor = (status: PresenceStatus) => {
    switch (status) {
      case 'active': return 'bg-green-400';
      case 'idle': return 'bg-yellow-400';
      case 'away': return 'bg-gray-500';
    }
  };

  const progress = session
    ? 1 - timeRemaining / (session.duration * 60)
    : 0;

  // ---------- Loading ----------
  if (loading || !session) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#1a1a2e] via-[#16213e] to-[#0f3460] flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
          className="w-12 h-12 border-4 border-[#ffcb77]/30 border-t-[#ffcb77] rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1a1a2e] via-[#16213e] to-[#0f3460] flex flex-col items-center justify-center px-4 relative overflow-hidden">

      {/* Theme indicator */}
      <div className="absolute top-6 left-6">
        <span className="text-2xl">{getThemeEmoji(session.theme)}</span>
      </div>

      {/* Mode badge */}
      <div className="absolute top-6 right-6">
        <span className="text-xs text-gray-500 bg-white/5 px-3 py-1 rounded-full">
          {session.mode === 'duo' ? 'Duo' : 'Solo'}
        </span>
      </div>

      {/* ---- MAIN CONTENT ---- */}
      <div className="flex flex-col items-center w-full max-w-sm">

        {/* Partner presence (duo modunda) */}
        {session.mode === 'duo' && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 text-center"
          >
            {partnerPresence ? (
              <div className="flex flex-col items-center">
                <motion.div
                  animate={{
                    scale: partnerPresence.status === 'active' ? [1, 1.05, 1] : 1,
                  }}
                  transition={{
                    repeat: partnerPresence.status === 'active' ? Infinity : 0,
                    duration: 3,
                    ease: 'easeInOut',
                  }}
                  className="text-5xl mb-2"
                >
                  {getAvatar(partnerPresence.avatar_id)}
                </motion.div>
                <p className="text-white text-sm font-medium">{partnerPresence.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`w-2 h-2 rounded-full ${getPartnerStatusColor(partnerPresence.status)}`} />
                  <span className="text-gray-400 text-xs">{getPartnerStatusText(partnerPresence.status)}</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <div className="text-5xl mb-2 opacity-30">👤</div>
                <p className="text-gray-500 text-sm">Ortak bekleniyor...</p>
              </div>
            )}
          </motion.div>
        )}

        {/* Timer Circle */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 100 }}
          className="relative w-56 h-56 mb-8"
        >
          {/* Background circle */}
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="4"
            />
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="#ffcb77"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 45}`}
              strokeDashoffset={`${2 * Math.PI * 45 * (1 - progress)}`}
              className="transition-all duration-1000 ease-linear"
            />
          </svg>

          {/* Timer text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-white text-4xl font-mono font-bold tracking-wider">
              {formatTime(timeRemaining)}
            </p>
            <p className="text-gray-500 text-xs mt-2">
              {session.duration} dakika
            </p>
          </div>
        </motion.div>

        {/* My presence status */}
        <div className="flex items-center gap-2 mb-12">
          <span className={`w-2 h-2 rounded-full ${getPartnerStatusColor(myPresenceStatus)}`} />
          <span className="text-gray-400 text-xs">
            {myPresenceStatus === 'active' ? 'Odaklanıyorsun' :
              myPresenceStatus === 'idle' ? 'Düşünüyorsun' : 'Uzaktasın'}
          </span>
        </div>

        {/* Partner left modal (duo) */}
        {partnerLeft && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center bg-white/5 rounded-2xl p-6"
          >
            <p className="text-white text-sm mb-1">Ortağın ayrıldı</p>
            <p className="text-gray-500 text-xs mb-4">Devam edebilir veya bitirebilirsin.</p>
            <div className="flex gap-3">
              <button
                onClick={() => { setPartnerLeft(false); setContinuingAlone(true); }}
                className="flex-1 py-2 px-4 rounded-xl bg-[#ffcb77]/20 text-[#ffcb77] text-sm hover:bg-[#ffcb77]/30 transition-colors"
              >
                Tek başıma devam et
              </button>
              <button
                onClick={handleSoloExit}
                className="flex-1 py-2 px-4 rounded-xl bg-white/5 text-gray-300 text-sm hover:bg-white/10 transition-colors"
              >
                Bitir
              </button>
            </div>
          </motion.div>
        )}

        {/* Exit button */}
        {!partnerLeft && (
          <AnimatePresence>
            {(session.mode === 'solo' || continuingAlone) ? (
              <motion.button
                key="solo-exit-btn"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={handleSoloExit}
                className="text-gray-600 hover:text-gray-400 text-sm transition-colors"
              >
                {COPY.SESSION_EXIT}
              </motion.button>
            ) : !showExitConfirm ? (
              <motion.button
                key="exit-btn"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowExitConfirm(true)}
                className="text-gray-600 hover:text-gray-400 text-sm transition-colors"
              >
                {COPY.SESSION_EXIT}
              </motion.button>
            ) : (
              <motion.div
                key="exit-confirm"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="text-center"
              >
                <p className="text-gray-400 text-sm mb-3">{COPY.TRUST_WARNING}</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowExitConfirm(false)}
                    className="flex-1 py-2 px-4 rounded-xl bg-white/5 text-gray-300 text-sm hover:bg-white/10 transition-colors"
                  >
                    Devam Et
                  </button>
                  <button
                    onClick={handleEarlyExit}
                    className="flex-1 py-2 px-4 rounded-xl bg-red-500/20 text-red-400 text-sm hover:bg-red-500/30 transition-colors"
                  >
                    Ayrıl
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      {/* Ambient animation dots */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(5)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-[#ffcb77]/10 rounded-full"
            style={{
              left: `${20 + i * 15}%`,
              top: `${30 + i * 10}%`,
            }}
            animate={{
              y: [0, -20, 0],
              opacity: [0.1, 0.3, 0.1],
            }}
            transition={{
              repeat: Infinity,
              duration: 4 + i,
              ease: 'easeInOut',
              delay: i * 0.5,
            }}
          />
        ))}
      </div>
    </div>
  );
}
