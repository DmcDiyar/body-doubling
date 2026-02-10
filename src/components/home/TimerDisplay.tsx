'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface TimerDisplayProps {
    minutes: number;
    seconds?: number;
    isFocusMode?: boolean;
}

export function TimerDisplay({ minutes, seconds = 0, isFocusMode }: TimerDisplayProps) {
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    const prevMinRef = useRef(minutes);
    const pulseRef = useRef<HTMLDivElement>(null);
    const isLastMinute = isFocusMode && minutes === 0 && seconds <= 59 && seconds > 0;
    const isCompleted = isFocusMode && minutes === 0 && seconds === 0;

    // Pulse on every minute change during focus mode
    useEffect(() => {
        if (!isFocusMode || !pulseRef.current) return;
        if (prevMinRef.current !== minutes) {
            prevMinRef.current = minutes;
            const el = pulseRef.current;
            el.style.transition = 'transform 120ms cubic-bezier(0.16, 1, 0.3, 1)';
            el.style.transform = 'scale(1.085)';
            const t = setTimeout(() => {
                el.style.transition = 'transform 400ms cubic-bezier(0.16, 1, 0.3, 1)';
                el.style.transform = 'scale(1.08)';
            }, 120);
            return () => clearTimeout(t);
        }
    }, [minutes, isFocusMode]);

    // Timer completion flash
    useEffect(() => {
        if (!isCompleted || !pulseRef.current) return;
        const el = pulseRef.current;
        el.style.transition = 'transform 300ms cubic-bezier(0.16, 1, 0.3, 1), opacity 300ms ease';
        el.style.transform = 'scale(1.12)';
        el.style.opacity = '0.6';
        const t = setTimeout(() => {
            el.style.transform = 'scale(1.08)';
            el.style.opacity = '1';
        }, 300);
        return () => clearTimeout(t);
    }, [isCompleted]);

    return (
        <div
            ref={pulseRef}
            style={{
                transform: isFocusMode ? 'scale(1.08)' : 'scale(1)',
                transition: 'transform 600ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
        >
            <motion.div
                key={isFocusMode ? 'focus' : `idle-${minutes}`}
                initial={{ opacity: 0.7 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className={`text-[140px] sm:text-[180px] md:text-[220px] font-extrabold
                   leading-none tracking-[-0.02em] select-none
                   drop-shadow-[0_10px_40px_rgba(0,0,0,0.6)]
                   ${isLastMinute ? 'text-orange-300' : 'text-white'}
                   ${isCompleted ? 'text-green-300' : ''}`}
                style={{
                    fontVariantNumeric: 'tabular-nums',
                    fontFeatureSettings: '"tnum"',
                    transition: 'color 1s ease',
                }}
            >
                {mm}:{ss}
            </motion.div>
        </div>
    );
}
