'use client';

import { motion } from 'framer-motion';

const rituals = [
    {
        title: 'Baslamadan Önce',
        description: '3 derin nefes al. Zihni temizle.',
        icon: (
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
        ),
        color: '#A8B5A0',
    },
    {
        title: 'Birlikte Basla',
        description: 'Ayni anda basliyorsunuz. Sesin yok, ama varligin var.',
        icon: (
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        ),
        color: '#E8A84C',
    },
    {
        title: 'Sessizce Bitir',
        description: 'Birlikte bitirdiniz. Tebrikler. Günün kalanina devam.',
        icon: (
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
        ),
        color: '#C4B8A8',
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
    hidden: { opacity: 0, scale: 0.98 },
    visible: {
        opacity: 1,
        scale: 1,
        transition: {
            duration: 0.6,
            ease: 'easeOut',
        },
    },
};

const Rituals = () => {
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
                        Ritüeller
                    </h2>
                    <p className="text-lg text-[#6B6B65] max-w-md mx-auto">
                        Her oturum küçük bir ritüelle baslar ve biter.
                    </p>
                </motion.div>

                {/* Rituals Grid */}
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    className="grid md:grid-cols-3 gap-6"
                >
                    {rituals.map((ritual, index) => (
                        <motion.div
                            key={index}
                            variants={itemVariants}
                            className="bg-white rounded-2xl p-8 text-center shadow-sm"
                        >
                            <div
                                className="w-16 h-16 mx-auto mb-6 rounded-full flex items-center justify-center"
                                style={{ backgroundColor: `${ritual.color}20`, color: ritual.color }}
                            >
                                {ritual.icon}
                            </div>
                            <h3 className="text-lg font-semibold text-[#1A1A18] mb-2">
                                {ritual.title}
                            </h3>
                            <p className="text-sm text-[#6B6B65] leading-relaxed">
                                {ritual.description}
                            </p>
                        </motion.div>
                    ))}
                </motion.div>
            </div>
        </section>
    );
};

export default Rituals;

