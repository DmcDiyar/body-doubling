'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DAILY_QUEST_INFO, WEEKLY_QUEST_INFO } from './QuestComponents';
import type { DailyQuest, WeeklyQuest } from './QuestComponents';

interface QuestTrackerProps {
    dailyQuest: DailyQuest | null;
    weeklyQuest: WeeklyQuest | null;
}

export function QuestTracker({ dailyQuest, weeklyQuest }: QuestTrackerProps) {
    const [expanded, setExpanded] = useState(false);

    if (!dailyQuest && !weeklyQuest) return null;

    const dailyInfo = dailyQuest ? DAILY_QUEST_INFO[dailyQuest.id] : null;
    const weeklyInfo = weeklyQuest ? WEEKLY_QUEST_INFO[weeklyQuest.id] : null;

    // Compact pill: show daily quest progress
    const activeDailyProgress = dailyQuest
        ? `${dailyQuest.progress}/${dailyQuest.target}`
        : null;

    return (
        <div className="absolute bottom-6 left-4 right-4 z-10">
            <AnimatePresence mode="wait">
                {!expanded ? (
                    <motion.button
                        key="pill"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        onClick={() => setExpanded(true)}
                        className="mx-auto flex items-center gap-2 bg-white/5 backdrop-blur-sm border border-white/10 rounded-full px-4 py-2"
                    >
                        <span className="text-xs text-gray-400">
                            {dailyInfo && !dailyQuest?.completed
                                ? dailyInfo.title
                                : weeklyInfo && !weeklyQuest?.completed
                                    ? weeklyInfo.title
                                    : 'Görevler'}
                        </span>
                        {activeDailyProgress && !dailyQuest?.completed && (
                            <span className="text-xs text-[#ffcb77] font-medium">{activeDailyProgress}</span>
                        )}
                        {dailyQuest?.completed && (
                            <span className="text-xs text-green-400">âœ“</span>
                        )}
                    </motion.button>
                ) : (
                    <motion.div
                        key="panel"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-4"
                    >
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-gray-500 text-xs uppercase tracking-wide">Görevler</p>
                            <button
                                onClick={() => setExpanded(false)}
                                className="text-gray-500 text-xs hover:text-gray-300"
                            >
                                Kapat
                            </button>
                        </div>

                        {/* Daily */}
                        {dailyQuest && dailyInfo && (
                            <div className="mb-3">
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-white text-sm">{dailyInfo.title}</span>
                                    {dailyQuest.completed ? (
                                        <span className="text-xs text-green-400">âœ“</span>
                                    ) : (
                                        <span className="text-xs text-gray-500">
                                            {dailyQuest.progress}/{dailyQuest.target}
                                        </span>
                                    )}
                                </div>
                                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${Math.min(dailyQuest.progress / dailyQuest.target, 1) * 100}%` }}
                                        className={`h-full rounded-full ${dailyQuest.completed ? 'bg-green-500' : 'bg-[#ffcb77]'}`}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Weekly */}
                        {weeklyQuest && weeklyInfo && (
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-white text-sm">{weeklyInfo.title}</span>
                                    {weeklyQuest.completed ? (
                                        <span className="text-xs text-green-400">âœ“</span>
                                    ) : (
                                        <span className="text-xs text-gray-500">
                                            {weeklyQuest.progress}/{weeklyQuest.target}
                                        </span>
                                    )}
                                </div>
                                <div className="flex gap-1">
                                    {Array.from({ length: weeklyQuest.target }).map((_, i) => (
                                        <div
                                            key={i}
                                            className={`flex-1 h-1.5 rounded-full ${i < weeklyQuest.progress
                                                ? weeklyQuest.completed ? 'bg-green-500' : 'bg-[#ffcb77]'
                                                : 'bg-white/10'
                                                }`}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

