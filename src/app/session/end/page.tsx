'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { useSessionStore } from '@/stores/session-store';
import { AVATARS, COPY } from '@/lib/constants';
import { motion } from 'framer-motion';
import type { Session, SessionParticipant, User, CompleteSessionResult } from '@/types/database';

export default function SessionEndWrapper() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-b from-[#1a1a2e] via-[#16213e] to-[#0f3460] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-[#ffcb77]/30 border-t-[#ffcb77] rounded-full animate-spin" />
      </div>
    }>
      <SessionEndPage />
    </Suspense>
  );
}

function SessionEndPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('id');
  const { session, myParticipation, reset } = useSessionStore();

  const [loading, setLoading] = useState(true);
  const [sessionData, setSessionData] = useState<Session | null>(session);
  const [myPart, setMyPart] = useState<SessionParticipant | null>(myParticipation);
  const [user, setUser] = useState<User | null>(null);
  const [rating, setRating] = useState<number>(0);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [results, setResults] = useState<CompleteSessionResult | null>(null);

  // ---------- Load data ----------
  useEffect(() => {
    if (!sessionId) return;

    const loadData = async () => {
      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { router.push('/auth'); return; }

      // Session
      if (!sessionData) {
        const { data: sData } = await supabase
          .from('sessions')
          .select('*')
          .eq('id', sessionId)
          .single();
        if (sData) setSessionData(sData as Session);
      }

      // My participation
      if (!myPart) {
        const { data: pData } = await supabase
          .from('session_participants')
          .select('*')
          .eq('session_id', sessionId)
          .eq('user_id', authUser.id)
          .single();
        if (pData) setMyPart(pData as SessionParticipant);
      }

      // User profile (güncel XP, streak vs.)
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();
      if (userData) setUser(userData as User);

      // Results from participation
      setResults({
        xp_earned: myPart?.xp_earned ?? 0,
        trust_change: myPart?.trust_score_change ?? 0,
        new_streak: (userData as User | null)?.current_streak ?? 0,
        goal_completed: myPart?.goal_completed ?? false,
      });

      setLoading(false);
    };

    loadData();
  }, [sessionId]);

  // ---------- Rating submit ----------
  const handleRating = async (stars: number) => {
    if (!sessionId || ratingSubmitted) return;
    setRating(stars);
    setRatingSubmitted(true);

    const supabase = createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;

    // Rating'i kaydet
    await supabase
      .from('session_participants')
      .update({ rating: stars })
      .eq('session_id', sessionId)
      .eq('user_id', authUser.id);

    // Trust event (RPC)
    if (sessionData?.mode === 'duo') {
      await supabase.rpc('process_partner_rating', {
        p_session_id: sessionId,
        p_rater_id: authUser.id,
        p_rating: stars,
      });
    }
  };

  // ---------- Navigation ----------
  const handleAgain = () => {
    reset();
    router.push('/session/quick-match');
  };

  const handleDone = () => {
    reset();
    router.push('/dashboard');
  };

  // ---------- Helpers ----------
  const getAvatar = (avatarId: number) => {
    return AVATARS.find((a) => a.id === avatarId)?.emoji ?? '🐱';
  };

  // ---------- Loading ----------
  if (loading) {
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
    <div className="min-h-screen bg-gradient-to-b from-[#1a1a2e] via-[#16213e] to-[#0f3460] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Celebration */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
          className="text-center mb-8"
        >
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
            className="text-6xl mb-4"
          >
            {user ? getAvatar(user.avatar_id) : '🎉'}
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-2xl font-bold text-white mb-1"
          >
            {COPY.SESSION_COMPLETE}
          </motion.h2>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-gray-400 text-sm"
          >
            {sessionData?.duration} dakika tamamlandı
          </motion.p>
        </motion.div>

        {/* Stats cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="grid grid-cols-3 gap-3 mb-8"
        >
          {/* XP earned */}
          <div className="bg-white/5 rounded-xl p-3 text-center">
            <p className="text-[#ffcb77] text-xl font-bold">
              +{results?.xp_earned ?? 0}
            </p>
            <p className="text-gray-500 text-xs mt-1">XP</p>
          </div>

          {/* Streak */}
          <div className="bg-white/5 rounded-xl p-3 text-center">
            <p className="text-white text-xl font-bold">
              {results?.new_streak ?? 0}
            </p>
            <p className="text-gray-500 text-xs mt-1">Seri</p>
          </div>

          {/* Trust change */}
          <div className="bg-white/5 rounded-xl p-3 text-center">
            <p className={`text-xl font-bold ${
              (results?.trust_change ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'
            }`}>
              {(results?.trust_change ?? 0) >= 0 ? '+' : ''}{results?.trust_change ?? 0}
            </p>
            <p className="text-gray-500 text-xs mt-1">Güven</p>
          </div>
        </motion.div>

        {/* Level progress */}
        {user && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="mb-8"
          >
            <div className="flex justify-between text-xs text-gray-500 mb-2">
              <span>Seviye {user.level}</span>
              <span>{user.xp} / {user.level * 100} XP</span>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (user.xp / (user.level * 100)) * 100)}%` }}
                transition={{ delay: 0.8, duration: 1, ease: 'easeOut' }}
                className="h-full bg-gradient-to-r from-[#ffcb77] to-[#ff9f1c] rounded-full"
              />
            </div>
          </motion.div>
        )}

        {/* Rating (duo modunda) */}
        {sessionData?.mode === 'duo' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="mb-8 text-center"
          >
            <p className="text-gray-400 text-sm mb-3">{COPY.SESSION_RATE}</p>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <motion.button
                  key={star}
                  whileHover={{ scale: 1.2 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => handleRating(star)}
                  disabled={ratingSubmitted}
                  className={`text-3xl transition-all ${
                    star <= rating
                      ? 'opacity-100'
                      : 'opacity-30 hover:opacity-60'
                  } ${ratingSubmitted ? 'cursor-default' : 'cursor-pointer'}`}
                >
                  ⭐
                </motion.button>
              ))}
            </div>
            {ratingSubmitted && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-gray-500 text-xs mt-2"
              >
                Teşekkürler!
              </motion.p>
            )}
          </motion.div>
        )}

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          className="flex flex-col gap-3"
        >
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleAgain}
            className="w-full bg-[#ffcb77] text-[#1a1a2e] font-semibold py-3 rounded-xl text-lg"
          >
            {COPY.SESSION_AGAIN}
          </motion.button>
          <button
            onClick={handleDone}
            className="text-gray-400 hover:text-white text-sm transition-colors"
          >
            {COPY.SESSION_DONE}
          </button>
        </motion.div>
      </div>
    </div>
  );
}
