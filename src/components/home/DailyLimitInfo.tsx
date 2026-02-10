'use client';

interface DailyLimitInfoProps {
    used: number;
    limit: number;
    isPremium: boolean;
    canStart: boolean;
}

export function DailyLimitInfo({ used, limit, isPremium, canStart }: DailyLimitInfoProps) {
    if (isPremium) return null;

    return (
        <div className="text-center mt-4">
            {!canStart ? (
                <p className="text-white/20 text-xs">
                    Bugünkü {limit} seans hakkını kullandın. Yarın tekrar gel veya premium&apos;a geç.
                </p>
            ) : (
                <p className="text-white/20 text-xs">
                    Bugün {used}/{limit} seans kullanıldı
                </p>
            )}
        </div>
    );
}
