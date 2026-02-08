'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';

const Navbar = () => {
    const [scrolled, setScrolled] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 20);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const navLinks = [
        { href: '#how-it-works', label: 'Nasil Çalisir' },
        { href: '#about', label: 'Hakkinda' },
    ];

    return (
        <motion.nav
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled
                    ? 'bg-white/80 backdrop-blur-md shadow-sm'
                    : 'bg-transparent'
                }`}
        >
            <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
                {/* Logo */}
                <Link href="/" className="flex flex-col items-start">
                    <span className="text-xl font-semibold text-[#1A1A18] tracking-tight">
                        Sessiz Ortak
                    </span>
                    <span className="text-[9px] text-[#9A9A94] font-medium tracking-wider uppercase">
                        Birlikte Odaklan
                    </span>
                </Link>

                {/* Desktop Navigation */}
                <div className="hidden md:flex items-center gap-8">
                    {navLinks.map((link) => (
                        <motion.div
                            key={link.href}
                            whileHover={{ scale: 1.02 }}
                            transition={{ duration: 0.2 }}
                        >
                            <Link
                                href={link.href}
                                className="text-[15px] font-medium text-[#6B6B65] hover:text-[#1A1A18] transition-colors"
                            >
                                {link.label}
                            </Link>
                        </motion.div>
                    ))}

                    <motion.div whileHover={{ scale: 1.02 }} transition={{ duration: 0.2 }}>
                        <Link
                            href="/auth"
                            className="text-[15px] font-medium text-[#1A1A18] px-5 py-2.5 rounded-full border border-[#E8E8E4] hover:border-[#C4B8A8] hover:bg-[#F5F4F0] transition-all"
                        >
                            Giris
                        </Link>
                    </motion.div>
                </div>

                {/* Mobile Menu Button */}
                <button
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    className="md:hidden p-2 text-[#1A1A18]"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="1.5"
                            d={mobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"}
                        />
                    </svg>
                </button>
            </div>

            {/* Mobile Menu */}
            {mobileMenuOpen && (
                <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="md:hidden bg-white/95 backdrop-blur-md border-t border-[#E8E8E4] px-6 py-6"
                >
                    <div className="flex flex-col gap-4">
                        {navLinks.map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                onClick={() => setMobileMenuOpen(false)}
                                className="text-lg font-medium text-[#1A1A18] py-2"
                            >
                                {link.label}
                            </Link>
                        ))}
                        <Link
                            href="/auth"
                            onClick={() => setMobileMenuOpen(false)}
                            className="text-lg font-medium text-[#1A1A18] py-2 mt-2 text-center border border-[#E8E8E4] rounded-full"
                        >
                            Giris
                        </Link>
                    </div>
                </motion.div>
            )}
        </motion.nav>
    );
};

export default Navbar;

