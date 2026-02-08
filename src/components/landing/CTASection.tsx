'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';

const CTASection = () => {
    return (
        <section className="py-32 px-6 relative overflow-hidden">
            {/* Subtle animated background gradient */}
            <motion.div
                animate={{
                    background: [
                        'linear-gradient(135deg, #FAFAF8 0%, #F5F4F0 50%, #FAFAF8 100%)',
                        'linear-gradient(135deg, #F5F4F0 0%, #FAFAF8 50%, #F5F4F0 100%)',
                        'linear-gradient(135deg, #FAFAF8 0%, #F5F4F0 50%, #FAFAF8 100%)',
                    ],
                }}
                transition={{
                    duration: 8,
                    repeat: Infinity,
                    ease: 'linear',
                }}
                className="absolute inset-0"
            />

            <div className="max-w-2xl mx-auto text-center relative z-10">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                >
                    <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-[#1A1A18] tracking-tight mb-6">
                        Hazir misin?
                    </h2>

                    <p className="text-lg text-[#6B6B65] mb-10 max-w-md mx-auto">
                        Birlikte odaklanmaya basla.
                        <br />
                        Ücretsiz. Kayit gerektirmez.
                    </p>

                    {/* Primary CTA */}
                    <motion.div
                        whileHover={{ y: -3 }}
                        transition={{ duration: 0.2 }}
                        className="inline-block"
                    >
                        <Link
                            href="/auth"
                            className="inline-flex items-center justify-center px-10 py-5 bg-[#E8A84C] hover:bg-[#D49840] text-white font-semibold text-xl rounded-full shadow-xl shadow-[#E8A84C]/25 transition-all"
                        >
                            Simdi Odaklan
                        </Link>
                    </motion.div>

                    {/* Optional secondary text */}
                    <motion.p
                        initial={{ opacity: 0 }}
                        whileInView={{ opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: 0.3 }}
                        className="mt-8 text-sm text-[#9A9A94]"
                    >
                        Hiçbir baglayicilik yok. Istedigin zaman çik.
                    </motion.p>
                </motion.div>
            </div>
        </section>
    );
};

export default CTASection;

