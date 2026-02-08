'use client';

import Link from 'next/link';

const Footer = () => {
    return (
        <footer className="py-12 px-6 bg-[#FAFAF8] border-t border-[#E8E8E4]">
            <div className="max-w-4xl mx-auto">
                <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                    {/* Logo */}
                    <div className="text-center md:text-left">
                        <span className="text-lg font-semibold text-[#1A1A18] tracking-tight">
                            Sessiz Ortak
                        </span>
                        <p className="text-sm text-[#9A9A94] mt-1">
                            Birlikte Odaklan, Sessizce
                        </p>
                    </div>

                    {/* Links */}
                    <div className="flex items-center gap-6 text-sm">
                        <Link href="#how-it-works" className="text-[#6B6B65] hover:text-[#1A1A18] transition-colors">
                            Nasil Çalisir
                        </Link>
                        <Link href="#about" className="text-[#6B6B65] hover:text-[#1A1A18] transition-colors">
                            Hakkinda
                        </Link>
                        <Link href="/privacy" className="text-[#6B6B65] hover:text-[#1A1A18] transition-colors">
                            Gizlilik
                        </Link>
                    </div>
                </div>

                {/* Copyright */}
                <div className="mt-8 pt-8 border-t border-[#E8E8E4] text-center">
                    <p className="text-sm text-[#9A9A94]">
                        © 2026 Sessiz Ortak. Presence {'>'} Pressure.
                    </p>
                </div>
            </div>
        </footer>
    );
};

export default Footer;

