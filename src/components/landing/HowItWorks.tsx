'use client';

import { motion } from 'framer-motion';

const steps = [
    {
        number: '01',
        title: 'Giris yap veya hemen basla',
        description: 'Kayit gerektirmez. Hemen odaklanmaya basla.',
        icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
        ),
    },
    {
        number: '02',
        title: 'Sessiz bir partnerle esles',
        description: 'Sistem seni baska biriyle eslestirir. Tamamen anonim.',
        icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
        ),
    },
    {
        number: '03',
        title: 'Zamanlayici baslasin',
        description: 'Ayni anda baslayin. Birlikte odaklanin.',
        icon: (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        ),
    },
    {
        number: '04',
        title: 'Birlikte bitirin',
        description: 'Oturum bitince sessizce ayrilin. Tebrikler.',
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
            staggerChildren: 0.15,
        },
    },
};

const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
        opacity: 1,
        y: 0,
        transition: {
            duration: 0.5,
            ease: 'easeOut',
        },
    },
};

const HowItWorks = () => {
    return (
        <section id="how-it-works" className="py-24 px-6 bg-[#FAFAF8]">
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
                        Nasil Çalisir
                    </h2>
                    <p className="text-lg text-[#6B6B65] max-w-md mx-auto">
                        Dört basit adimda odaklanmaya basla.
                    </p>
                </motion.div>

                {/* Steps */}
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    className="grid md:grid-cols-2 gap-6"
                >
                    {steps.map((step) => (
                        <motion.div
                            key={step.number}
                            variants={itemVariants}
                            className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm"
                        >
                            <div className="flex items-start gap-4">
                                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-[#F5F4F0] flex items-center justify-center text-[#6B6B65]">
                                    {step.icon}
                                </div>
                                <div>
                                    <span className="text-xs font-semibold text-[#E8A84C] tracking-wider">
                                        ADIM {step.number}
                                    </span>
                                    <h3 className="text-lg font-semibold text-[#1A1A18] mt-1 mb-2">
                                        {step.title}
                                    </h3>
                                    <p className="text-sm text-[#6B6B65] leading-relaxed">
                                        {step.description}
                                    </p>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </motion.div>
            </div>
        </section>
    );
};

export default HowItWorks;

