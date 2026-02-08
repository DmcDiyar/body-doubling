'use client';

import { motion } from 'framer-motion';

const trustItems = [
    {
        title: 'Gizlilik Öncelikli',
        description: 'Kimligin asla paylasilmaz. Tamamen anonim.',
        icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
        ),
    },
    {
        title: 'Veri Toplamiyoruz',
        description: 'Kisisel veri saklamiyoruz. Izleme yok.',
        icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
        ),
    },
    {
        title: 'Güvenli Baglanti',
        description: 'Tüm baglantilar sifreli. Güvende oldugunu bil.',
        icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        ),
    },
];

const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1,
        },
    },
};

const itemVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            duration: 0.4,
            ease: 'easeOut',
        },
    },
};

const TrustSafety = () => {
    return (
        <section className="py-24 px-6 bg-[#FAFAF8]">
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
                        Güven & Gizlilik
                    </h2>
                    <p className="text-lg text-[#6B6B65] max-w-md mx-auto">
                        Güvende hissetmen için tasarlandi.
                    </p>
                </motion.div>

                {/* Trust Items */}
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    className="grid md:grid-cols-3 gap-6"
                >
                    {trustItems.map((item, index) => (
                        <motion.div
                            key={index}
                            variants={itemVariants}
                            className="bg-white rounded-2xl p-6 text-center shadow-sm"
                        >
                            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[#A8B5A0]/20 flex items-center justify-center text-[#A8B5A0]">
                                {item.icon}
                            </div>
                            <h3 className="text-base font-semibold text-[#1A1A18] mb-2">
                                {item.title}
                            </h3>
                            <p className="text-sm text-[#6B6B65]">
                                {item.description}
                            </p>
                        </motion.div>
                    ))}
                </motion.div>
            </div>
        </section>
    );
};

export default TrustSafety;

