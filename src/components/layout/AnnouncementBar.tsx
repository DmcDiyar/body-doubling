import React from 'react';

const AnnouncementBar = () => {
    return (
        <div className="w-full bg-[#7C3AED] py-2 px-4 flex items-center justify-center text-center">
            <p className="text-white text-xs sm:text-sm font-medium">
                🚀 <span className="font-bold">Teklif 28 Şubat&apos;ta sona eriyor:</span> Flocus Plus&apos;a ömür boyu erişim sadece 99$.{' '}
                <a href="#" className="underline hover:opacity-80 transition-opacity">
                    Şimdi satın alın, sonsuza kadar kullanın →
                </a>
            </p>
        </div>
    );
};

export default AnnouncementBar;
