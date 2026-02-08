import React from 'react';

const AnnouncementBar = () => {
    return (
        <div className="w-full bg-[#7C3AED] py-2 px-4 flex items-center justify-center text-center">
            <p className="text-white text-xs sm:text-sm font-medium">
                ğŸš€ <span className="font-bold">Teklif 28 Subat&apos;ta sona eriyor:</span> Flocus Plus&apos;a ömür boyu erisim sadece 99$.{' '}
                <a href="#" className="underline hover:opacity-80 transition-opacity">
                    Simdi satin alin, sonsuza kadar kullanin â†’
                </a>
            </p>
        </div>
    );
};

export default AnnouncementBar;

