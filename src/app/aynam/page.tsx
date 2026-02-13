'use client';

import { useState, useEffect } from 'react';
import { useAynam } from '@/hooks/useAynam';
import { useProfilePhoto } from '@/hooks/useProfilePhoto';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase-client';

// ============================================================
// Types
// ============================================================

interface SeasonInfo {
    season_number: number;
    day_in_season: number;
    season_length_days: number;
    days_remaining: number;
}

interface MenteeInfo {
    mentee_name: string;
    mentee_sessions: number;
    mentee_stage: string;
    mentee_streak: number;
}

interface MentorSummary {
    is_mentor: boolean;
    as_mentor?: MenteeInfo[];
    as_mentee?: {
        mentor_name: string;
        mentor_sessions: number;
        your_sessions_during: number;
    } | null;
}

// ============================================================
// AYNAM — Profil / Ayna Sayfası
// HTML birebir dönüştürme + progresif açılma
// ============================================================

// Gün kısaltmaları (TR)
const DAY_LABELS = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pa'];
const DAY_LABELS_SHORT = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu'];

export default function AynamPage() {
    const router = useRouter();
    const {
        data,
        loading,
        error,
        visibility,
        completionRate,
        xpProgress,
        formatMinutes,
        trustBadge,
    } = useAynam();

    // Profil fotoğrafı
    const { avatarUrl, uploading, triggerUpload, remove: removePhoto } = useProfilePhoto(
        data?.user?.avatar_url ?? null
    );

    // Sezon bilgisi
    const [season, setSeason] = useState<SeasonInfo | null>(null);
    // Mentor bilgisi
    const [mentor, setMentor] = useState<MentorSummary | null>(null);

    useEffect(() => {
        if (!data) return;
        const supabase = createClient();

        // Sezon bilgisi
        supabase.rpc('get_season_info').then(({ data: sInfo }) => {
            if (sInfo) setSeason(sInfo);
        });

        // Mentor
        supabase.rpc('get_mentor_summary', { p_user_id: '' }).then(({ data: mInfo }) => {
            if (mInfo) setMentor(mInfo);
        });
    }, [data]);

    // ---- LOADING ----
    if (loading) {
        return (
            <div className="min-h-screen bg-[#121214] flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 rounded-full border-2 border-[#FFB800]/30 border-t-[#FFB800] animate-spin" />
                    <span className="text-sm text-slate-400 font-medium">Aynam yükleniyor...</span>
                </div>
            </div>
        );
    }

    // ---- ERROR ----
    if (error || !data) {
        return (
            <div className="min-h-screen bg-[#121214] flex items-center justify-center">
                <div className="text-center">
                    <span className="text-4xl mb-4 block">🪞</span>
                    <p className="text-slate-400 text-sm">Aynam yüklenemedi</p>
                    <p className="text-slate-600 text-xs mt-1">{error}</p>
                </div>
            </div>
        );
    }

    const { user } = data;
    const focusReady = data.focus_score.ready;
    const score = data.focus_score.score ?? 0;

    // Gauge ring hesaplama (SVG stroke)
    const circumference = 2 * Math.PI * 40; // r=40
    const gaugeOffset = focusReady
        ? circumference - (circumference * score) / 100
        : circumference;

    // Unlocked badge count
    const unlockedBadges = data.badges.filter(b => b.unlocked).length;
    const totalBadges = data.badges.length;

    // ============================================================
    // RENDER
    // ============================================================
    return (
        <div className="min-h-screen bg-[#F8F9FA] dark:bg-[#121214] text-slate-800 dark:text-slate-100 selection:bg-[#FFB800] selection:text-black"
            style={{ fontFamily: "var(--font-plus-jakarta), var(--font-geist-sans), sans-serif" }}>

            <div className="max-w-[1440px] mx-auto px-6 py-8 flex gap-8">

                {/* ==================== MAIN (60%) ==================== */}
                <main className="w-[60%] space-y-6">

                    {/* ---- HEADER ---- */}
                    <header className="glass-aynam bg-white/60 dark:bg-[rgba(30,30,34,0.7)] p-6 rounded-2xl flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            {/* Avatar circle */}
                            <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-[#FFB800]/20 to-[#FFB800] p-1 shadow-lg shadow-[#FFB800]/20">
                                <div className="w-full h-full rounded-full bg-[#121214] flex items-center justify-center overflow-hidden">
                                    {avatarUrl ? (
                                        <Image src={avatarUrl} alt={user.name} width={64} height={64} className="w-full h-full object-cover" unoptimized />
                                    ) : (
                                        <span className="text-2xl font-bold text-[#FFB800]">
                                            {user.name.charAt(0).toUpperCase()}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h1 className="text-xl font-bold">{user.name}</h1>
                                    <span className="bg-[#FFB800]/10 text-[#FFB800] text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wider border border-[#FFB800]/20">
                                        {trustBadge(user.trust_level)}
                                    </span>
                                </div>
                                <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
                                    Seviye {user.level} • {user.completed_sessions} seans • {formatMinutes(user.total_minutes)}
                                </p>
                            </div>
                        </div>

                        {/* XP İlerlemesi */}
                        <div className="w-1/3">
                            <div className="flex justify-between items-end mb-2">
                                <span className="text-[10px] font-semibold text-slate-400 tracking-widest uppercase">XP İlerlemesi</span>
                                <span className="text-xs font-bold text-[#FFB800]">
                                    {user.xp - data.xp_level_start}/{data.xp_level_end - data.xp_level_start} XP
                                </span>
                            </div>
                            <div className="h-2 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                                <motion.div
                                    className="h-full bg-[#FFB800] shadow-[0_0_10px_rgba(255,184,0,0.5)]"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(xpProgress, 100)}%` }}
                                    transition={{ duration: 1, ease: 'easeOut' }}
                                />
                            </div>
                        </div>
                    </header>

                    {/* ---- SEZON BİLGİSİ ---- */}
                    {season && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="glass-aynam bg-white/60 dark:bg-[rgba(30,30,34,0.7)] p-4 rounded-2xl flex items-center justify-between"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                                    <span className="text-lg">🏆</span>
                                </div>
                                <div>
                                    <p className="text-sm font-bold">Sezon {season.season_number}</p>
                                    <p className="text-[10px] text-slate-500">
                                        Gün {season.day_in_season}/{season.season_length_days} • Kalan {season.days_remaining} gün
                                    </p>
                                </div>
                            </div>
                            <div className="w-24">
                                <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                                    <motion.div
                                        className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                                        initial={{ width: 0 }}
                                        animate={{ width: `${Math.round((season.day_in_season / season.season_length_days) * 100)}%` }}
                                        transition={{ duration: 1, ease: 'easeOut' }}
                                    />
                                </div>
                                <p className="text-[9px] text-slate-500 text-right mt-1">
                                    {Math.round((season.day_in_season / season.season_length_days) * 100)}%
                                </p>
                            </div>
                        </motion.div>
                    )}

                    {/* ---- ODAK SKORU + RADAR ---- */}
                    <AnimatePresence>
                        {visibility.showFocusScore && focusReady && (
                            <motion.section
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="grid grid-cols-2 gap-6"
                            >
                                {/* Odak Skoru */}
                                <div className="glass-aynam bg-white/60 dark:bg-[rgba(30,30,34,0.7)] p-6 rounded-2xl">
                                    <div className="flex justify-between items-start mb-6">
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Odak Skoru</h3>
                                        {data.weekly.session_trend === 'up' && (
                                            <span className="text-[10px] text-green-500 font-bold bg-green-500/10 px-2 py-0.5 rounded-full">
                                                ↑ {score}%
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-8">
                                        {/* Gauge Ring */}
                                        <div className="relative w-28 h-28">
                                            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                                                <circle className="text-slate-200 dark:text-slate-800" cx="50" cy="50" r="40"
                                                    fill="transparent" stroke="currentColor" strokeWidth="8" />
                                                <circle cx="50" cy="50" r="40" fill="transparent"
                                                    stroke="url(#amberGrad)" strokeWidth="8" strokeLinecap="round"
                                                    strokeDasharray={circumference}
                                                    strokeDashoffset={gaugeOffset}
                                                    style={{ transition: 'stroke-dashoffset 1.5s ease-out' }} />
                                                <defs>
                                                    <linearGradient id="amberGrad" x1="0%" x2="100%" y1="0%" y2="0%">
                                                        <stop offset="0%" stopColor="#FFB800" />
                                                        <stop offset="100%" stopColor="#FFD700" />
                                                    </linearGradient>
                                                </defs>
                                            </svg>
                                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                                <span className="text-3xl font-black">{score}</span>
                                                <span className="text-[10px] font-bold text-slate-500 -mt-1">PUAN</span>
                                            </div>
                                        </div>
                                        {/* Score breakdown */}
                                        <div className="flex-1 space-y-2">
                                            <div className="flex justify-between text-[11px]">
                                                <span className="text-slate-500">Tutarlılık</span>
                                                <span className="font-bold">{data.focus_score.consistency}/{data.focus_score.max_per_component}</span>
                                            </div>
                                            <div className="flex justify-between text-[11px]">
                                                <span className="text-slate-500">Tamamlama</span>
                                                <span className="font-bold">{data.focus_score.completion}/{data.focus_score.max_per_component}</span>
                                            </div>
                                            <div className="flex justify-between text-[11px]">
                                                <span className="text-slate-500">Seri</span>
                                                <span className="font-bold">{data.focus_score.streak}/{data.focus_score.max_per_component}</span>
                                            </div>
                                            <div className="flex justify-between text-[11px]">
                                                <span className="text-slate-500">Hacim</span>
                                                <span className="font-bold">{data.focus_score.volume}/{data.focus_score.max_per_component}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Yetenek Haritası (Radar) */}
                                {visibility.showRadar && (
                                    <div className="glass-aynam bg-white/60 dark:bg-[rgba(30,30,34,0.7)] p-6 rounded-2xl relative overflow-hidden">
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-6">Yetenek Haritası</h3>
                                        <div className="relative w-full h-28 flex items-center justify-center">
                                            <div className="absolute w-24 h-24 border border-dashed border-slate-700 rounded-full opacity-20" />
                                            <div className="absolute w-16 h-16 border border-dashed border-slate-700 rounded-full opacity-20" />
                                            <div className="w-24 h-24 bg-[#FFB800]/20 border border-[#FFB800]/50"
                                                style={{ clipPath: 'polygon(50% 10%, 85% 35%, 80% 80%, 30% 90%, 15% 45%)' }} />
                                            <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-bold text-slate-400">TUTARLILIK</span>
                                            <span className="absolute top-1/4 -right-1 text-[9px] font-bold text-slate-400">TAMAMLAMA</span>
                                            <span className="absolute -bottom-2 right-1/4 text-[9px] font-bold text-slate-400">SERİ</span>
                                            <span className="absolute -bottom-2 left-1/4 text-[9px] font-bold text-slate-400">HACİM</span>
                                            <span className="absolute top-1/4 -left-1 text-[9px] font-bold text-slate-400">ODAK</span>
                                        </div>
                                    </div>
                                )}

                                {/* Radar gizliyse discovery/formation mesajı */}
                                {!visibility.showRadar && (
                                    <div className="glass-aynam bg-white/60 dark:bg-[rgba(30,30,34,0.7)] p-6 rounded-2xl flex flex-col items-center justify-center">
                                        <span className="text-3xl mb-2">🔮</span>
                                        <p className="text-xs text-slate-500 text-center">
                                            Yetenek Haritası {user.maturity_stage === 'growth' ? '5 seans sonra' : 'ilerleyen seviyelerde'} açılacak.
                                        </p>
                                    </div>
                                )}
                            </motion.section>
                        )}
                    </AnimatePresence>

                    {/* Discovery stage mesajı (Odak Skoru yerine) */}
                    {!visibility.showFocusScore && (
                        <section className="glass-aynam bg-white/60 dark:bg-[rgba(30,30,34,0.7)] p-6 rounded-2xl">
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 rounded-2xl bg-[#FFB800]/10 flex items-center justify-center">
                                    <span className="text-2xl">🪞</span>
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-slate-300">Odak Profilin Oluşuyor</p>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        {data.focus_score.sessions_needed != null && data.focus_score.sessions_needed > 0
                                            ? `${data.focus_score.sessions_needed} seans daha tamamla`
                                            : data.focus_score.days_needed != null && data.focus_score.days_needed > 0
                                                ? `${data.focus_score.days_needed} gün daha bekle`
                                                : 'Skorun hesaplanıyor...'}
                                    </p>
                                    {/* Progress dots */}
                                    <div className="flex gap-1 mt-2">
                                        {Array.from({ length: 10 }, (_, i) => (
                                            <div key={i} className={`w-2 h-2 rounded-full ${i < user.completed_sessions ? 'bg-[#FFB800]' : 'bg-slate-700'
                                                }`} />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </section>
                    )}

                    {/* ---- 4 MİNİ KART ---- */}
                    <section className="grid grid-cols-4 gap-4">
                        {/* Aktif Seri */}
                        <div className="glass-aynam bg-white/60 dark:bg-[rgba(30,30,34,0.7)] p-4 rounded-2xl group hover:border-[#FFB800]/30 transition-all">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="material-icons-round text-orange-500 text-lg">local_fire_department</span>
                                <span className="text-[10px] font-bold text-slate-500 uppercase">Aktif Seri</span>
                            </div>
                            <div className="flex items-baseline gap-1">
                                <span className="text-2xl font-black">{user.current_streak}</span>
                                <span className="text-xs text-slate-500">gün</span>
                            </div>
                        </div>

                        {/* Toplam */}
                        <div className="glass-aynam bg-white/60 dark:bg-[rgba(30,30,34,0.7)] p-4 rounded-2xl">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="material-icons-round text-blue-500 text-lg">schedule</span>
                                <span className="text-[10px] font-bold text-slate-500 uppercase">Toplam</span>
                            </div>
                            <div className="flex items-baseline gap-1">
                                <span className="text-2xl font-black">{Math.floor(user.total_minutes / 60)}</span>
                                <span className="text-xs text-slate-500">s {user.total_minutes % 60}dk</span>
                            </div>
                        </div>

                        {/* Güven */}
                        <div className="glass-aynam bg-white/60 dark:bg-[rgba(30,30,34,0.7)] p-4 rounded-2xl border-l-4 border-l-blue-500">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="material-icons-round text-blue-400 text-lg">verified_user</span>
                                <span className="text-[10px] font-bold text-slate-500 uppercase">Güven</span>
                            </div>
                            <div className="flex items-baseline gap-1">
                                <span className="text-2xl font-black text-blue-400">{user.trust_score}</span>
                                <span className="text-xs text-slate-500">/ 200</span>
                            </div>
                        </div>

                        {/* Tamamlama */}
                        <div className="glass-aynam bg-white/60 dark:bg-[rgba(30,30,34,0.7)] p-4 rounded-2xl border-l-4 border-l-emerald-500">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="material-icons-round text-emerald-500 text-lg">task_alt</span>
                                <span className="text-[10px] font-bold text-slate-500 uppercase">Tamamlama</span>
                            </div>
                            <div className="flex items-baseline gap-1">
                                <span className="text-2xl font-black text-emerald-500">
                                    {user.completed_sessions < 5 ? user.completed_sessions : completionRate}
                                </span>
                                <span className="text-xs text-slate-500">
                                    {user.completed_sessions < 5 ? `/ ${user.completed_sessions + user.abandoned_sessions} seans` : '%'}
                                </span>
                            </div>
                        </div>
                    </section>

                    {/* ---- KENDİNİ KIYASLA + SERİ ANALİZİ ---- */}
                    <section className="grid grid-cols-5 gap-6">
                        {/* Kendini Kıyasla */}
                        {visibility.showWeeklyComparison && (
                            <div className="col-span-2 glass-aynam bg-white/60 dark:bg-[rgba(30,30,34,0.7)] p-5 rounded-2xl">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Kendini Kıyasla</h3>
                                    <span className="text-[9px] bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-400">Haftalık</span>
                                </div>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-slate-400">Seans</span>
                                        <div className="flex items-center gap-1">
                                            <span className="font-bold">{data.weekly.this_week.sessions}</span>
                                            <span className={`material-icons-round text-xs ${data.weekly.session_trend === 'up' ? 'text-green-500' :
                                                data.weekly.session_trend === 'down' ? 'text-red-500' : 'text-slate-500'
                                                }`}>
                                                {data.weekly.session_trend === 'up' ? 'north' :
                                                    data.weekly.session_trend === 'down' ? 'south' : 'remove'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-slate-400">Odak Süresi</span>
                                        <div className="flex items-center gap-1">
                                            <span className="font-bold">{data.weekly.this_week.minutes}dk</span>
                                            <span className={`material-icons-round text-xs ${data.weekly.minutes_trend === 'up' ? 'text-green-500' :
                                                data.weekly.minutes_trend === 'down' ? 'text-red-500' : 'text-slate-500'
                                                }`}>
                                                {data.weekly.minutes_trend === 'up' ? 'north' :
                                                    data.weekly.minutes_trend === 'down' ? 'south' : 'remove'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                {/* Dinamik mesaj */}
                                {visibility.showDynamicMessage && data.dynamic_message && (
                                    <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                                        <p className="text-[10px] italic text-slate-500">{data.dynamic_message}</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Seri Analizi */}
                        <div className={`${visibility.showWeeklyComparison ? 'col-span-3' : 'col-span-5'} glass-aynam bg-white/60 dark:bg-[rgba(30,30,34,0.7)] p-5 rounded-2xl`}>
                            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">Seri Analizi</h3>
                            <div className="flex flex-col items-center justify-center">
                                <span className="text-4xl font-black text-[#FFB800] mb-1">{user.current_streak}</span>
                                <span className="text-xs font-bold text-slate-400 mb-6 uppercase tracking-widest">GÜN</span>
                                <div className="flex justify-between w-full px-4 gap-2">
                                    {data.streak_days.slice(0, 5).map((day, i) => (
                                        <div key={i} className="flex flex-col items-center gap-2">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${day.had_session
                                                ? 'bg-[#FFB800]/20 border border-[#FFB800]/50'
                                                : 'bg-slate-200 dark:bg-slate-800 border border-transparent opacity-40'
                                                }`}>
                                                <span className={`material-icons-round text-sm ${day.had_session ? 'text-[#FFB800]' : 'text-slate-500'
                                                    }`}>
                                                    {day.had_session ? 'local_fire_department' : 'close'}
                                                </span>
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-500">
                                                {DAY_LABELS_SHORT[i] || DAY_LABELS[day.day_of_week - 1]}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* ---- AKTİVİTE HARİTASI ---- */}
                    <AnimatePresence>
                        {visibility.showHeatmap && (
                            <motion.section
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="glass-aynam bg-white/60 dark:bg-[rgba(30,30,34,0.7)] p-6 rounded-2xl"
                            >
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Aktivite Haritası</h3>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-slate-500">Az</span>
                                        <div className="flex gap-1">
                                            <div className="w-3 h-3 rounded-sm bg-slate-800 border border-slate-700" />
                                            <div className="w-3 h-3 rounded-sm bg-[#FFB800]/20" />
                                            <div className="w-3 h-3 rounded-sm bg-[#FFB800]/40" />
                                            <div className="w-3 h-3 rounded-sm bg-[#FFB800]/70" />
                                            <div className="w-3 h-3 rounded-sm bg-[#FFB800]" />
                                        </div>
                                        <span className="text-[10px] text-slate-500">Çok</span>
                                    </div>
                                </div>
                                <div className="grid grid-cols-7 gap-1">
                                    {/* Gün başlıkları */}
                                    {DAY_LABELS.map(d => (
                                        <div key={d} className="text-[10px] text-center font-bold text-slate-500 pb-2">{d}</div>
                                    ))}
                                    {/* Heatmap cells */}
                                    {data.heatmap.map((day, i) => {
                                        const intensityClass = [
                                            'bg-slate-200 dark:bg-slate-800 opacity-20',
                                            'bg-[#FFB800]/20',
                                            'bg-[#FFB800]/40',
                                            'bg-[#FFB800]/70',
                                            'bg-[#FFB800] shadow-[0_0_15px_rgba(255,184,0,0.3)]',
                                        ][day.intensity] || 'bg-slate-200 dark:bg-slate-800 opacity-20';

                                        return (
                                            <div
                                                key={i}
                                                className={`h-10 glass-aynam ${intensityClass} rounded-md`}
                                                title={`${day.date}: ${day.session_count} seans, ${day.total_minutes}dk`}
                                            />
                                        );
                                    })}
                                </div>
                            </motion.section>
                        )}
                    </AnimatePresence>

                    {/* ---- ROZETLER ---- */}
                    <AnimatePresence>
                        {visibility.showBadges && (
                            <motion.section
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="glass-aynam bg-white/60 dark:bg-[rgba(30,30,34,0.7)] p-6 rounded-2xl"
                            >
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Rozetler</h3>
                                    <span className="text-xs font-bold text-[#FFB800]">{unlockedBadges}/{totalBadges} Unlocked</span>
                                </div>
                                <div className="grid grid-cols-6 gap-6">
                                    {data.badges.slice(0, 6).map(badge => {
                                        const tierKey = badge.unlocked ? (((badge as unknown as Record<string, unknown>).tier as string) || 'gold') : 'gold';
                                        const tierStyles: Record<string, string> = {
                                            bronze: 'bg-orange-500/10 border-2 border-orange-600/40 shadow-lg shadow-orange-500/10',
                                            silver: 'bg-slate-300/10 border-2 border-slate-400/40 shadow-lg shadow-slate-300/10',
                                            gold: 'bg-[#FFB800]/10 border-2 border-[#FFB800]/40 shadow-lg shadow-[#FFB800]/10',
                                        };
                                        const tierStyle = badge.unlocked
                                            ? (tierStyles[tierKey] || tierStyles.gold)
                                            : 'bg-slate-200 dark:bg-slate-800/50 grayscale opacity-40 hover:opacity-100 hover:grayscale-0';

                                        const tierLabels: Record<string, string> = {
                                            bronze: '🥉',
                                            silver: '🥈',
                                            gold: '🥇',
                                        };
                                        const tierLabel = badge.unlocked ? tierLabels[tierKey] || null : null;

                                        return (
                                            <div key={badge.id} className="relative group">
                                                <div className={`w-full aspect-square rounded-xl flex items-center justify-center transition-all ${tierStyle}`}>
                                                    <span className="text-2xl">{badge.icon}</span>
                                                </div>
                                                {/* Tier indicator */}
                                                {tierLabel && (
                                                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[10px]">
                                                        {tierLabel}
                                                    </span>
                                                )}
                                                {!badge.unlocked && (
                                                    <span className="absolute -top-1 -right-1 material-icons-round text-[14px] text-slate-600 bg-[#121214] rounded-full">
                                                        lock
                                                    </span>
                                                )}
                                                {/* Tooltip on hover */}
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                                    <div className="bg-black/90 text-white text-[9px] px-2 py-1 rounded-lg whitespace-nowrap">
                                                        {badge.name}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </motion.section>
                        )}
                    </AnimatePresence>
                </main>

                {/* ==================== ASIDE (40%) ==================== */}
                <aside className="w-[40%] space-y-6">
                    <div className="glass-aynam bg-white dark:bg-[rgba(30,30,34,0.7)] rounded-[32px] overflow-hidden sticky top-8 shadow-2xl shadow-black/20">
                        {/* Avatar area — tıklayınca fotoğraf yükle */}
                        <div
                            className="relative h-[480px] w-full flex items-center justify-center bg-gradient-to-b from-slate-100 to-slate-200 dark:from-neutral-800/50 dark:to-neutral-900/50 p-8 cursor-pointer group"
                            onClick={triggerUpload}
                        >
                            <div className="relative z-10 w-full h-full flex items-center justify-center">
                                {avatarUrl ? (
                                    /* Kullanıcı fotoğrafı */
                                    <Image
                                        src={avatarUrl}
                                        alt={user.name}
                                        width={256}
                                        height={256}
                                        className="w-64 h-64 object-cover rounded-full drop-shadow-2xl border-2 border-[#FFB800]/20"
                                        style={{ animation: 'breathe 4s ease-in-out infinite' }}
                                        unoptimized
                                    />
                                ) : (
                                    /* Fotoğraf yoksa initial */
                                    <div className="w-64 h-64 rounded-full bg-gradient-to-br from-[#FFB800]/30 to-[#FFB800]/10 border-2 border-[#FFB800]/20 flex items-center justify-center drop-shadow-2xl"
                                        style={{ animation: 'breathe 4s ease-in-out infinite' }}>
                                        <span className="text-8xl font-black text-[#FFB800]/80">
                                            {user.name.charAt(0).toUpperCase()}
                                        </span>
                                    </div>
                                )}
                                {/* Upload overlay (hover'da görünür) */}
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <div className="bg-black/50 rounded-full p-4">
                                        {uploading ? (
                                            <div className="w-8 h-8 rounded-full border-2 border-[#FFB800]/30 border-t-[#FFB800] animate-spin" />
                                        ) : (
                                            <span className="material-icons-round text-3xl text-white">photo_camera</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            {/* Glow effects */}
                            <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-[#FFB800]/20 blur-[80px] rounded-full" />
                            <div className="absolute bottom-1/4 right-1/4 w-32 h-32 bg-blue-500/10 blur-[80px] rounded-full" />

                            {/* Controls */}
                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3 px-6 py-3 bg-white/10 glass-aynam rounded-full" onClick={e => e.stopPropagation()}>
                                <button
                                    onClick={() => router.push('/session/quick-match')}
                                    className="w-8 h-8 rounded-full bg-[#FFB800] flex items-center justify-center text-black"
                                >
                                    <span className="material-icons-round text-lg">play_arrow</span>
                                </button>
                                <button
                                    onClick={async () => {
                                        if (avatarUrl && confirm('Fotoğrafını silmek istiyor musun?')) {
                                            await removePhoto();
                                        } else {
                                            triggerUpload();
                                        }
                                    }}
                                    className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
                                    title={avatarUrl ? 'Fotoğrafı sil' : 'Fotoğraf yükle'}
                                >
                                    <span className="material-icons-round text-lg">{avatarUrl ? 'delete' : 'photo_camera'}</span>
                                </button>
                                <button
                                    onClick={triggerUpload}
                                    className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
                                    title="Fotoğraf değiştir"
                                >
                                    <span className="material-icons-round text-lg">refresh</span>
                                </button>
                            </div>
                        </div>

                        {/* Kişisel Rekorlar */}
                        {visibility.showRecords && (
                            <div className="p-8 space-y-6 bg-white dark:bg-[#18181b]">
                                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">Kişisel Rekorlar</h3>
                                <div className="space-y-4">
                                    {/* En uzun seri */}
                                    <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200/50 dark:border-white/5 transition-all hover:scale-[1.02]">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-500">
                                                <span className="material-icons-round">local_fire_department</span>
                                            </div>
                                            <span className="text-sm font-semibold text-slate-500">En uzun seri</span>
                                        </div>
                                        <span className="text-base font-black">{data.records.longest_streak} gün</span>
                                    </div>

                                    {/* En uzun seans */}
                                    <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200/50 dark:border-white/5 transition-all hover:scale-[1.02]">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-[#FFB800]/10 flex items-center justify-center text-[#FFB800]">
                                                <span className="material-icons-round">timer</span>
                                            </div>
                                            <span className="text-sm font-semibold text-slate-500">En uzun seans</span>
                                        </div>
                                        <span className="text-base font-black">{data.records.longest_session_minutes} dk</span>
                                    </div>

                                    {/* Bir günde en çok */}
                                    <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200/50 dark:border-white/5 transition-all hover:scale-[1.02]">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
                                                <span className="material-icons-round">layers</span>
                                            </div>
                                            <span className="text-sm font-semibold text-slate-500">Bir günde en çok</span>
                                        </div>
                                        <span className="text-base font-black">{data.records.max_sessions_per_day} seans</span>
                                    </div>

                                    {/* En geç */}
                                    <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200/50 dark:border-white/5 transition-all hover:scale-[1.02]">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-500">
                                                <span className="material-icons-round">nightlight</span>
                                            </div>
                                            <span className="text-sm font-semibold text-slate-500">En geç</span>
                                        </div>
                                        <span className="text-base font-black">{data.records.latest_hour}:00</span>
                                    </div>
                                </div>

                                {/* Durum + Seans Başlat */}
                                <div className="pt-4 flex items-center justify-between">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-slate-500 font-bold uppercase">Durum</span>
                                        <span className="text-xs font-bold text-emerald-500">
                                            Aktif • Bugün {data.today_sessions}/3 Seans
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => router.push('/session/quick-match')}
                                        className="px-6 py-2.5 bg-[#FFB800] text-black font-black text-xs rounded-full shadow-lg shadow-[#FFB800]/20 hover:scale-105 transition-transform uppercase tracking-widest"
                                    >
                                        Seans Başlat
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ---- MENTOR BÖLÜMÜ ---- */}
                    {mentor && (mentor.is_mentor || mentor.as_mentee) && (
                        <div className="glass-aynam bg-white/60 dark:bg-[rgba(30,30,34,0.7)] p-5 rounded-2xl">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">
                                {mentor.is_mentor ? '🎓 Mentor Paneli' : '🌱 Mentorluk'}
                            </h3>

                            {/* Mentor olarak */}
                            {mentor.is_mentor && mentor.as_mentor && mentor.as_mentor.length > 0 && (
                                <div className="space-y-3">
                                    <p className="text-[10px] text-slate-500">{mentor.as_mentor.length} aktif mentee</p>
                                    {mentor.as_mentor.map((m: MenteeInfo, i: number) => (
                                        <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                                                    <span className="text-sm">🌱</span>
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold">{m.mentee_name}</p>
                                                    <p className="text-[10px] text-slate-500">
                                                        {m.mentee_sessions} seans • {m.mentee_stage}
                                                    </p>
                                                </div>
                                            </div>
                                            <span className="text-xs font-bold text-emerald-500">
                                                🔥 {m.mentee_streak}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Mentee olarak */}
                            {mentor.as_mentee && (
                                <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center">
                                            <span className="text-sm">🎓</span>
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold">{mentor.as_mentee.mentor_name}</p>
                                            <p className="text-[10px] text-slate-500">
                                                Mentor • {mentor.as_mentee.mentor_sessions} seans
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] text-slate-500">Senin seans</p>
                                        <p className="text-xs font-bold">{mentor.as_mentee.your_sessions_during}</p>
                                    </div>
                                </div>
                            )}

                            {/* Mentor gereksinim */}
                            {!mentor.is_mentor && !mentor.as_mentee && (
                                <p className="text-[10px] text-slate-500 italic">
                                    Mentor olmak için: growth+ seviye, 50 seans, 100 güven puanı.
                                </p>
                            )}
                        </div>
                    )}
                </aside>
            </div>

            {/* ---- BOTTOM NAV ---- */}
            <nav className="fixed bottom-8 left-1/2 -translate-x-1/2 glass-aynam bg-white/60 dark:bg-[rgba(30,30,34,0.8)] px-6 py-3 rounded-2xl flex items-center gap-8 shadow-2xl z-50">
                <Link href="/dashboard" className="flex flex-col items-center gap-1 text-slate-400 hover:text-[#FFB800] transition-colors">
                    <span className="material-icons-round">home</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider">Ana Sayfa</span>
                </Link>
                <Link href="/aynam" className="flex flex-col items-center gap-1 text-[#FFB800] relative">
                    <span className="material-icons-round">person</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider">Profil</span>
                    <div className="absolute -top-1 right-0 w-1.5 h-1.5 bg-[#FFB800] rounded-full animate-pulse" />
                </Link>
                <Link href="/stats" className="flex flex-col items-center gap-1 text-slate-400 hover:text-[#FFB800] transition-colors">
                    <span className="material-icons-round">auto_graph</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider">Akış</span>
                </Link>
                <Link href="/focus-library" className="flex flex-col items-center gap-1 text-slate-400 hover:text-[#FFB800] transition-colors">
                    <span className="material-icons-round">grid_view</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider">Kütüphane</span>
                </Link>
            </nav>

            {/* ---- GLOBAL STYLES (glass + breathe animation) ---- */}
            <style jsx global>{`
        .glass-aynam {
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.05);
        }
        @keyframes breathe {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.02); opacity: 1; }
        }
      `}</style>
        </div>
    );
}
