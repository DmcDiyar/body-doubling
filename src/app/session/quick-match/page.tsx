'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { DURATIONS, THEMES, COPY, TRUST, MATCHING_TIMEOUT_MS, AVATARS, getRandomMessage, getRandomFunFact } from '@/lib/constants';
import { useSessionStore } from '@/stores/session-store';
import { motion, AnimatePresence } from 'framer-motion';
import type { Session, SessionParticipant, User } from '@/types/database';

type Phase = 'config' | 'matching' | 'found' | 'solo-offer';

export default function QuickMatchPage() {
  const router = useRouter();
  const { setSession, setMyParticipation } = useSessionStore();

  const [phase, setPhase] = useState<Phase>('config');
  const [duration, setDuration] = useState(25);
  const [theme, setTheme] = useState('rainy_cafe');
  const [matchTimer, setMatchTimer] = useState(30);
  const [motivationalMsg, setMotivationalMsg] = useState(getRandomMessage());
  const [funFact, setFunFact] = useState(getRandomFunFact());
  const [queueCount, setQueueCount] = useState(0);
  const [userAvatar, setUserAvatar] = useState<string>('🐱');

  // Rotate messages every 5 seconds during matching phase
  useEffect(() => {
    if (phase !== 'matching') return;
    const interval = setInterval(() => {
      setMotivationalMsg(getRandomMessage());
      setFunFact(getRandomFunFact());
    }, 5000);
    return () => clearInterval(interval);
  }, [phase]);

  // Load user avatar and subscribe to queue count
  useEffect(() => {
    if (phase !== 'matching') return;
    const supabase = createClient();

    // Get user avatar
    const loadAvatar = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('users')
          .select('avatar_id')
          .eq('id', user.id)
          .single();
        if (profile) {
          const avatar = AVATARS.find(a => a.id === profile.avatar_id);
          if (avatar) setUserAvatar(avatar.emoji);
        }
      }
    };
    loadAvatar();

    // Get initial queue count
    const getQueueCount = async () => {
      const { count } = await supabase
        .from('matching_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'waiting');
      setQueueCount(count || 0);
    };
    getQueueCount();

    // Subscribe to queue changes
    const channel = supabase
      .channel('queue-count')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'matching_queue'
      }, () => {
        getQueueCount();
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [phase]);

  const handleStartMatching = async () => {
    const supabase = createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;

    // Trust score kontrol
    const { data: profile } = await supabase
      .from('users')
      .select('trust_score')
      .eq('id', authUser.id)
      .single();

    if (!profile || (profile as User).trust_score < TRUST.SOLO_ONLY_THRESHOLD) {
      // Trust çok düşük, sadece solo
      handleStartSolo(authUser.id);
      return;
    }

    setPhase('matching');

    // Kuyruğa ekle - CHECK FIRST pattern (409 Conflict fix)
    // Önce kullanıcının kuyrukta bekleyen kaydı var mı kontrol et
    const priority = (profile as User).trust_score >= TRUST.HIGH_PRIORITY_THRESHOLD ? 2 :
      (profile as User).trust_score >= TRUST.LOW_PRIORITY_THRESHOLD ? 1 : 0;

    const { data: existingQueue } = await supabase
      .from('matching_queue')
      .select('id, status')
      .eq('user_id', authUser.id)
      .eq('status', 'waiting')
      .maybeSingle();

    // Eğer zaten bekleyen kayıt varsa, yeni insert yapma
    // Sadece kayıt yoksa veya başka status'teyse insert yap
    if (!existingQueue) {
      // Önce eski kayıtları temizle (expired, cancelled, matched olabilir)
      await supabase
        .from('matching_queue')
        .delete()
        .eq('user_id', authUser.id);

      // Yeni kayıt ekle
      await supabase.from('matching_queue').insert({
        user_id: authUser.id,
        duration,
        theme,
        priority,
        status: 'waiting',
        expires_at: new Date(Date.now() + MATCHING_TIMEOUT_MS).toISOString(),
      });
    }

    // Eşleşme dene (RPC)
    const { data: sessionId } = await supabase.rpc('find_match', {
      p_user_id: authUser.id,
      p_duration: duration,
      p_theme: theme,
    });

    if (sessionId) {
      // Eşleşme bulundu!
      await loadSession(sessionId as string, authUser.id);
      setPhase('found');

      // 3sn sonra prepare ekranına git (pomodoro + ritual)
      setTimeout(() => {
        router.push(`/session/prepare?id=${sessionId}`);
      }, 3000);
      return;
    }

    // Eşleşme bulunamadı, realtime dinle
    const channel = supabase
      .channel('matching')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'session_participants',
          filter: `user_id=eq.${authUser.id}`,
        },
        async (payload) => {
          const participant = payload.new as SessionParticipant;
          await loadSession(participant.session_id, authUser.id);
          setPhase('found');
          channel.unsubscribe();

          setTimeout(() => {
            router.push(`/session/prepare?id=${participant.session_id}`);
          }, 3000);
        }
      )
      .subscribe();

    // Countdown
    const interval = setInterval(() => {
      setMatchTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          channel.unsubscribe();
          // Kuyruktan çık
          supabase.from('matching_queue')
            .update({ status: 'expired' })
            .eq('user_id', authUser.id)
            .eq('status', 'waiting')
            .then();
          setPhase('solo-offer');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const loadSession = async (sessionId: string, userId: string) => {
    const supabase = createClient();

    const { data: session } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    const { data: myPart } = await supabase
      .from('session_participants')
      .select('*')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .single();

    if (session) setSession(session as Session);
    if (myPart) setMyParticipation(myPart as SessionParticipant);
  };

  const handleStartSolo = async (userId?: string) => {
    const supabase = createClient();
    if (!userId) {
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id;
    }
    if (!userId) return;

    // Solo session oluştur
    const { data: session } = await supabase
      .from('sessions')
      .insert({
        duration,
        mode: 'solo',
        theme,
        status: 'waiting',
      })
      .select()
      .single();

    if (!session) return;

    await supabase.from('session_participants').insert({
      session_id: (session as Session).id,
      user_id: userId,
      status: 'waiting',
    });

    setSession(session as Session);
    router.push(`/session/active?id=${(session as Session).id}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1a1a2e] via-[#16213e] to-[#0f3460] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <AnimatePresence mode="wait">
          {/* ---- CONFIG PHASE ---- */}
          {phase === 'config' && (
            <motion.div
              key="config"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <button
                onClick={() => router.push('/dashboard')}
                className="text-gray-500 hover:text-white mb-6 text-sm"
              >
                ← Dashboard
              </button>

              <h2 className="text-xl font-bold text-white mb-6">Hızlı Eşleşme</h2>

              {/* Süre seçimi */}
              <p className="text-gray-400 text-sm mb-3">Kaç dakika çalışacaksın?</p>
              <div className="grid grid-cols-3 gap-3 mb-6">
                {DURATIONS.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => setDuration(d.value)}
                    className={`
                      p-3 rounded-xl text-center transition-all
                      ${duration === d.value
                        ? 'bg-[#ffcb77]/20 border-2 border-[#ffcb77] text-white'
                        : 'bg-white/5 border-2 border-transparent text-gray-400 hover:bg-white/10'
                      }
                    `}
                  >
                    <p className="font-bold">{d.label}</p>
                    <p className="text-xs mt-1 opacity-60">{d.description}</p>
                  </button>
                ))}
              </div>

              {/* Tema seçimi */}
              <p className="text-gray-400 text-sm mb-3">Tema</p>
              <div className="flex flex-col gap-2 mb-8">
                {THEMES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    className={`
                      flex items-center gap-3 p-3 rounded-xl transition-all
                      ${theme === t.id
                        ? 'bg-[#ffcb77]/20 border-2 border-[#ffcb77]'
                        : 'bg-white/5 border-2 border-transparent hover:bg-white/10'
                      }
                    `}
                  >
                    <span className="text-xl">{t.emoji}</span>
                    <span className="text-white text-sm">{t.name}</span>
                  </button>
                ))}
              </div>

              {/* Start */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleStartMatching}
                className="w-full bg-[#ffcb77] text-[#1a1a2e] font-semibold py-4 rounded-2xl text-lg"
              >
                Eşleş
              </motion.button>
            </motion.div>
          )}

          {/* ---- MATCHING PHASE ---- */}
          {phase === 'matching' && (
            <motion.div
              key="matching"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="text-center max-w-sm mx-auto"
            >
              {/* Animated Avatar */}
              <div className="relative w-24 h-24 mx-auto mb-6">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
                  className="absolute inset-0 border-4 border-[#ffcb77]/30 border-t-[#ffcb77] rounded-full"
                />
                <div className="absolute inset-2 bg-white/10 rounded-full flex items-center justify-center">
                  <motion.span
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                    className="text-4xl"
                  >
                    {userAvatar}
                  </motion.span>
                </div>
              </div>

              {/* Title */}
              <p className="text-white text-lg mb-2">{COPY.MATCHING_SEARCHING}</p>

              {/* Timer */}
              <p className="text-[#ffcb77] text-4xl font-bold mb-2">
                ⏱️ {matchTimer} saniye
              </p>

              {/* Progress bar */}
              <div className="w-full bg-white/10 rounded-full h-2 mb-6">
                <motion.div
                  className="bg-[#ffcb77] h-2 rounded-full"
                  initial={{ width: '100%' }}
                  animate={{ width: `${(matchTimer / 30) * 100}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>

              {/* Divider */}
              <div className="border-t border-white/10 my-6" />

              {/* Fun Fact */}
              <motion.div
                key={funFact}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/5 border border-white/10 rounded-xl p-4 mb-4 text-left"
              >
                <div className="flex items-start gap-3">
                  <span className="text-xl">💡</span>
                  <div>
                    <p className="text-[#ffcb77] text-xs font-semibold mb-1">Bilgin var mıydı?</p>
                    <p className="text-white/80 text-sm">{funFact}</p>
                  </div>
                </div>
              </motion.div>

              {/* Divider */}
              <div className="border-t border-white/10 my-6" />

              {/* Queue Count */}
              {queueCount > 0 && (
                <div className="flex items-center justify-center gap-2 text-gray-400 text-sm mb-4">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span>{queueCount} kişi şu an bekliyor</span>
                </div>
              )}

              {/* Motivational Message */}
              <motion.p
                key={motivationalMsg}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-gray-400 text-sm italic mb-6"
              >
                {`"${motivationalMsg}"`}
              </motion.p>

              {/* Solo Mode Button */}
              <button
                onClick={() => {
                  setPhase('solo-offer');
                }}
                className="text-gray-500 hover:text-white text-sm transition-colors border border-white/20 hover:border-white/40 px-4 py-2 rounded-lg"
              >
                {COPY.MATCHING_SOLO}
              </button>
              <p className="text-gray-600 text-xs mt-2">
                (İsterseniz hemen)
              </p>
            </motion.div>
          )}

          {/* ---- FOUND PHASE ---- */}
          {phase === 'found' && (
            <motion.div
              key="found"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 200 }}
              className="text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring' }}
                className="text-6xl mb-4"
              >
                🎉
              </motion.div>
              <h2 className="text-2xl font-bold text-white mb-2">
                {COPY.MATCHING_FOUND}
              </h2>
              <p className="text-gray-400">Seans başlıyor...</p>
            </motion.div>
          )}

          {/* ---- SOLO OFFER PHASE ---- */}
          {phase === 'solo-offer' && (
            <motion.div
              key="solo"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center"
            >
              <p className="text-gray-400 text-lg mb-6">
                {COPY.MATCHING_TIMEOUT}
              </p>

              <div className="flex flex-col gap-3">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleStartSolo()}
                  className="w-full bg-[#ffcb77] text-[#1a1a2e] font-semibold py-3 rounded-xl"
                >
                  {COPY.MATCHING_SOLO}
                </motion.button>
                <button
                  onClick={() => {
                    setMatchTimer(30);
                    handleStartMatching();
                  }}
                  className="text-gray-400 hover:text-white text-sm"
                >
                  {COPY.MATCHING_RETRY}
                </button>
                <button
                  onClick={() => router.push('/dashboard')}
                  className="text-gray-600 hover:text-gray-400 text-sm"
                >
                  Vazgeç
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
