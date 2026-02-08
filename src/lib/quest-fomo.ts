// ============================================================
// Sessiz Ortak - Quest FOMO System
// Mystery descriptions, FOMO messages, reveal logic
// ============================================================

// Mystery descriptions for unrevealed quests
export const QUEST_MYSTERY_DESCRIPTIONS: Record<string, { teaser: string; hint: string }> = {
    daily_ritual_1: {
        teaser: 'Bugünün görevi seni bekliyor...',
        hint: 'Baslangiçla ilgili bir sey.',
    },
    daily_pomodoro_25: {
        teaser: 'Bir sey yapman gerekiyor, ama ne?',
        hint: 'Zamanla ilgili.',
    },
    daily_cooldown: {
        teaser: 'Bugün atlamaman gereken bir sey var.',
        hint: 'Bitirisle ilgili.',
    },
    weekly_streak_3: {
        teaser: 'Bu hafta kendini kanitlaman gereken bir sey...',
        hint: 'Tutarlilikla ilgili.',
    },
    weekly_sessions_5: {
        teaser: 'Haftanin hedefi gizli.',
        hint: 'Sayiyla ilgili.',
    },
    weekly_duration_mix: {
        teaser: 'Farkli bir sey denemen gerekebilir.',
        hint: 'Çesitlilikle ilgili.',
    },
};

// FOMO messages for dashboard display
export const FOMO_MESSAGES = [
    'Dün bunu yapanlar bugün farkli bir sey gördü',
    'Bir pencere kapandi',
    'Son 24 saatte çogu kisinin kaçirdigi bir an var',
    'Kaçirdigin anlar geri gelmiyor',
    'Dünkü firsat sessizce geçti',
    'Bazi seyler tekrar gelmez',
    'Bu görev artik görünmüyor',
    'Bir sey degisti ama fark etmedin',
    'Geçen sefer burada olan sey artik yok',
    'Sessizce bir kapi kapandi',
] as const;

// Quest state types for mystery mode
export type QuestFomoState = 'unrevealed' | 'revealed' | 'locked' | 'completed' | 'missed';

export function getQuestFomoState(quest: {
    revealed?: boolean;
    completed?: boolean;
    locked_until?: string | null;
    missed_at?: string | null;
}): QuestFomoState {
    if (quest.completed) return 'completed';

    if (quest.locked_until) {
        const lockEnd = new Date(quest.locked_until);
        if (lockEnd > new Date()) return 'locked';
    }

    if (quest.missed_at) return 'missed';

    // Default: old quests without revealed field are treated as revealed
    const isRevealed = quest.revealed ?? true;
    return isRevealed ? 'revealed' : 'unrevealed';
}

export function getLockTimeRemaining(lockedUntil: string): string {
    const diff = new Date(lockedUntil).getTime() - Date.now();
    if (diff <= 0) return '';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}s ${minutes}dk`;
}

