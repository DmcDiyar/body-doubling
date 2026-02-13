'use client';

interface DailyLimitInfoProps {
    used: number;
    limit: number;
    isPremium: boolean;
    canStart: boolean;
}

export function DailyLimitInfo({ used, limit, isPremium, canStart }: DailyLimitInfoProps) {
    if (isPremium) return null;

    const remaining = limit - used;

    return (
        <div className="text-center mt-4">
            {!canStart ? (
                <div className="flex flex-col items-center gap-2">
                    <p className="text-white/30 text-xs">
                        🔒 Bugünkü {limit} seans hakkını kullandın.
                    </p>
                    <button className="text-[#eea62b] text-xs font-semibold hover:underline transition-colors">
                        Premium ile sınırsız odaklan →
                    </button>
                </div>
            ) : remaining === 1 ? (
                <p className="text-[#eea62b]/60 text-xs font-medium animate-pulse">
                    ⚡ Son 1 seansın kaldı — değerlendir!
                </p>
            ) : (
                <p className="text-white/20 text-xs">
                    Bugün {used}/{limit} seans kullanıldı
                </p>
            )}
        </div>
    );
}
