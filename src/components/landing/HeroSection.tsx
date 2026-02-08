'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

const HeroSection = () => {
    return (
        <section className="min-h-[90vh] flex flex-col items-center justify-center px-6 pt-24 pb-16">
            <div className="max-w-3xl mx-auto text-center">
                {/* Main Heading */}
                <motion.h1
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-semibold text-[#1A1A18] tracking-tight leading-[1.1] mb-6"
                >
                    Odaklan. Birlikte. Sessizce.
                </motion.h1>

                {/* Subheading */}
                <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
                    className="text-lg sm:text-xl text-[#6B6B65] font-normal max-w-xl mx-auto mb-10 leading-relaxed"
                >
                    Sessiz Ortak, seni başka biriyle eşleştirir.
                    <br className="hidden sm:block" />
                    Konuşma yok. Sadece birlikte odaklanma.
                </motion.p>

                {/* CTAs */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, ease: 'easeOut', delay: 0.4 }}
                    className="flex flex-col sm:flex-row items-center justify-center gap-4"
                >
                    {/* Primary CTA */}
                    <motion.div
                        whileHover={{ y: -3 }}
                        transition={{ duration: 0.2 }}
                    >
                        <Link
                            href="/auth"
                            className="inline-flex items-center justify-center px-8 py-4 bg-[#E8A84C] hover:bg-[#D49840] text-white font-semibold text-lg rounded-full shadow-lg shadow-[#E8A84C]/20 transition-all"
                        >
                            Oturum Başlat
                        </Link>
                    </motion.div>

                    {/* Secondary CTA */}
                    <motion.div
                        whileHover={{ scale: 1.02 }}
                        transition={{ duration: 0.2 }}
                    >
                        <Link
                            href="#how-it-works"
                            className="inline-flex items-center justify-center px-8 py-4 text-[#6B6B65] hover:text-[#1A1A18] font-medium text-lg transition-colors"
                        >
                            Nasıl Çalışır?
                            <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </svg>
                        </Link>
                    </motion.div>
                </motion.div>

                {/* Subtle trust indicator */}
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6, delay: 0.8 }}
                    className="mt-12 text-sm text-[#9A9A94]"
                >
                    Ücretsiz. Kayıt gerektirmez.
                </motion.p>
            </div>
        </section>
    );
};

export default HeroSection;
