import type { DailyQuest, WeeklyQuest } from '@/components/quests/QuestComponents';

// ============================================================
// Quest FOMO State Machine
// ============================================================

export type QuestFomoState = 'unrevealed' | 'revealed' | 'locked' | 'completed' | 'missed';

/**
 * Determine the FOMO state of a quest.
 * - unrevealed: quest exists but user hasn't revealed it yet
 * - revealed: user clicked "reveal" (irreversible)
 * - locked: quest was missed and locked for 48h
 * - completed: quest was completed
 * - missed: quest expired without completion (past day/week)
 */
export function getQuestFomoState(
  quest: (DailyQuest | WeeklyQuest) & { revealed?: boolean; locked_until?: string } | null
): QuestFomoState {
  if (!quest) return 'missed';
  if (quest.completed) return 'completed';

  // Check lock
  if (quest.locked_until) {
    const lockEnd = new Date(quest.locked_until);
    if (lockEnd > new Date()) return 'locked';
  }

  // Default: old quests without `revealed` field are treated as revealed (backward compat)
  const isRevealed = quest.revealed !== undefined ? quest.revealed : true;

  return isRevealed ? 'revealed' : 'unrevealed';
}

// ============================================================
// Mystery Descriptions (shown when quest is unrevealed)
// ============================================================

export const QUEST_MYSTERY_DESCRIPTIONS: Record<string, { teaser: string; hint: string }> = {
  // Daily quests
  daily_ritual_1: {
    teaser: 'Bir şeyle başlamak gerekiyor...',
    hint: 'Başlangıçla ilgili',
  },
  daily_pomodoro_25: {
    teaser: 'Derinlere inmek cesaret ister.',
    hint: 'Süreyle ilgili',
  },
  daily_cooldown: {
    teaser: 'Bitirmek de bir sanat.',
    hint: 'Kapanışla ilgili',
  },
  // Weekly quests
  weekly_streak_3: {
    teaser: 'Tutarlılık, sessiz bir güç.',
    hint: 'Devamlılıkla ilgili',
  },
  weekly_sessions_5: {
    teaser: 'Sayılar bir şey anlatıyor.',
    hint: 'Miktarla ilgili',
  },
  weekly_duration_mix: {
    teaser: 'Farklılık güzeldir.',
    hint: 'Çeşitlilikle ilgili',
  },
};

// ============================================================
// FOMO Messages (dashboard banner)
// ============================================================

export const FOMO_MESSAGES = [
  'Dün bunu yapanlar bugün farklı bir şey gördü.',
  'Bir pencere kapandı. Ama yenisi açılabilir.',
  'Kaçırdığın görev hala bir yerlerde bekliyor.',
  'Dünkü görev artık geçmişte kaldı.',
  'Görevini tamamlayanlar bir adım önde.',
  'Sessizce ilerleyenler farkı yarattı.',
  'Bir fırsat kaçtı. Ama bugün yeni bir gün.',
  'Dün burada olanlar bir şey kazandı.',
  'Zamanı geri alamazsın ama yenisini yaratabilirsin.',
  'Her kaçırılan görev, bir sonrakini daha değerli kılar.',
] as const;

// ============================================================
// Lock Timer Helper
// ============================================================

export function getLockTimeRemaining(lockedUntil: string | undefined): string | null {
  if (!lockedUntil) return null;
  const end = new Date(lockedUntil).getTime();
  const now = Date.now();
  const diff = end - now;

  if (diff <= 0) return null;

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) return `${hours}s ${minutes}dk`;
  return `${minutes}dk`;
}
