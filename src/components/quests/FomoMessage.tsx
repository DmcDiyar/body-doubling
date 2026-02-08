'use client';

import { motion } from 'framer-motion';

interface FomoMessageProps {
    message: string;
    missedCount?: number;
}

export function FomoMessage({ message, missedCount }: FomoMessageProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative overflow-hidden rounded-2xl p-4 mb-6"
        >
            {/* Subtle glow background */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#ffcb77]/5 via-transparent to-[#ffcb77]/5" />
            <motion.div
                animate={{ x: [-200, 200] }}
                transition={{ repeat: Infinity, duration: 4, ease: 'linear' }}
                className="absolute inset-0 w-1/3 bg-gradient-to-r from-transparent via-[#ffcb77]/10 to-transparent"
            />

            <div className="relative">
                <p className="text-gray-300 text-sm italic text-center">
                    &ldquo;{message}&rdquo;
                </p>
                {missedCount && missedCount > 1 && (
                    <p className="text-gray-600 text-xs text-center mt-2">
                        {missedCount} kaçirilmis an
                    </p>
                )}
            </div>
        </motion.div>
    );
}

