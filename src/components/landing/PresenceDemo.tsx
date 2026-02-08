'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';

const PresenceDemo = () => {
    const [isHovering, setIsHovering] = useState(false);

    return (
        <section className="py-24 px-6 bg-[#F5F4F0]">
            <div className="max-w-4xl mx-auto">
                {/* Section Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6 }}
                    className="text-center mb-16"
                >
                    <h2 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-[#1A1A18] tracking-tight mb-4">
                        Farkı hisset
                    </h2>
                    <p className="text-lg text-[#6B6B65] max-w-md mx-auto">
                        Yalnız çalışmak ile birlikte çalışmak arasındaki fark.
                    </p>
                </motion.div>

                {/* Interactive Demo */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                    className="relative"
                    onMouseEnter={() => setIsHovering(true)}
                    onMouseLeave={() => setIsHovering(false)}
                >
                    <div className="grid md:grid-cols-2 gap-8">
                        {/* Alone State */}
                        <motion.div
                            animate={{
                                opacity: isHovering ? 0.5 : 1,
                                scale: isHovering ? 0.98 : 1,
                            }}
                            transition={{ duration: 0.4, ease: 'easeInOut' }}
                            className="bg-white rounded-3xl p-8 sm:p-12 text-center shadow-sm"
                        >
                            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-[#E8E8E4] flex items-center justify-center">
                                <svg className="w-8 h-8 text-[#9A9A94]" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-semibold text-[#1A1A18] mb-2">Yalnız</h3>
                            <p className="text-[#6B6B65] text-sm">
                                Dikkat dağılıyor.<br />
                                Motivasyon düşük.
                            </p>
                        </motion.div>

                        {/* Together State */}
                        <motion.div
                            animate={{
                                opacity: isHovering ? 1 : 0.7,
                                scale: isHovering ? 1.02 : 1,
                            }}
                            transition={{ duration: 0.4, ease: 'easeInOut' }}
                            className="bg-white rounded-3xl p-8 sm:p-12 text-center shadow-sm border-2 border-transparent"
                            style={{
                                borderColor: isHovering ? '#E8A84C' : 'transparent',
                            }}
                        >
                            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-[#E8A84C]/10 flex items-center justify-center">
                                <svg className="w-8 h-8 text-[#E8A84C]" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-semibold text-[#1A1A18] mb-2">Birlikte</h3>
                            <p className="text-[#6B6B65] text-sm">
                                Sessiz varlık hissi.<br />
                                Odak korunuyor.
                            </p>
                        </motion.div>
                    </div>

                    {/* Hint */}
                    <p className="text-center mt-8 text-sm text-[#9A9A94]">
                        Üzerine gel ve farkı gör
                    </p>
                </motion.div>
            </div>
        </section>
    );
};

export default PresenceDemo;
