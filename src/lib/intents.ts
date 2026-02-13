// Intent tanımları
export const INTENTS = [
    { id: 'bitirmek', label: 'Bitirmek', emoji: '🎯', desc: 'Yarım kalanı tamamla' },
    { id: 'baslamak', label: 'Başlamak', emoji: '🚀', desc: 'Yeni bir şeye adım at' },
    { id: 'sakin_kalmak', label: 'Sakin kalmak', emoji: '🧘', desc: 'Stressiz çalış' },
    { id: 'var_olmak', label: 'Var olmak', emoji: '👁️', desc: 'Sadece orada ol' },
] as const;

export type IntentId = typeof INTENTS[number]['id'];

export const INTENT_MAP: Record<string, typeof INTENTS[number]> = Object.fromEntries(
    INTENTS.map(i => [i.id, i])
);
