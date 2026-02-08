'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FOCUS_ARTICLES } from '@/lib/focus-articles';
import type { FocusArticle } from '@/lib/focus-articles';
import { BottomNav } from '@/components/layout/BottomNav';

export default function FocusLibraryPage() {
    const [selectedArticle, setSelectedArticle] = useState<FocusArticle | null>(null);

    return (
        <div className="min-h-screen bg-gradient-to-b from-[#1a1a2e] via-[#16213e] to-[#0f3460] px-4 py-8 pb-24">
            <div className="max-w-sm mx-auto">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-8"
                >
                    <h1 className="text-white text-xl font-bold mb-1">Odak Kütüphanesi</h1>
                    <p className="text-gray-500 text-sm">Verimlilik, odaklanma ve aliskanliklar hakkinda.</p>
                </motion.div>

                {/* Article list */}
                <div className="space-y-3">
                    {FOCUS_ARTICLES.map((article, i) => (
                        <motion.button
                            key={article.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.05 * i }}
                            onClick={() => setSelectedArticle(article)}
                            className="w-full text-left bg-white/5 rounded-2xl p-4 border border-white/10 hover:border-white/20 transition-colors"
                        >
                            <div className="flex items-start gap-3">
                                <span className="text-2xl mt-0.5">{article.emoji}</span>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-white font-medium text-sm mb-1">{article.title}</h3>
                                    <p className="text-gray-400 text-xs line-clamp-2">{article.summary}</p>
                                    <div className="flex items-center gap-2 mt-2">
                                        <span className="text-gray-600 text-xs">{article.readTime} dk okuma</span>
                                        {article.tags.map(tag => (
                                            <span key={tag} className="text-gray-600 text-xs bg-white/5 px-2 py-0.5 rounded-full">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </motion.button>
                    ))}
                </div>
            </div>

            {/* Article detail modal */}
            <AnimatePresence>
                {selectedArticle && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/80 overflow-y-auto"
                        onClick={() => setSelectedArticle(null)}
                    >
                        <motion.div
                            initial={{ y: 50, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 50, opacity: 0 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="min-h-screen pt-12 pb-8 px-4"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="max-w-sm mx-auto bg-gradient-to-b from-[#1a1a2e] to-[#0f3460] rounded-2xl border border-white/10 p-6">
                                {/* Close button */}
                                <button
                                    onClick={() => setSelectedArticle(null)}
                                    className="text-gray-500 hover:text-gray-300 text-sm mb-4 transition-colors"
                                >
                                    â† Geri
                                </button>

                                {/* Article header */}
                                <div className="text-center mb-6">
                                    <span className="text-4xl">{selectedArticle.emoji}</span>
                                    <h2 className="text-white text-lg font-bold mt-3 mb-2">
                                        {selectedArticle.title}
                                    </h2>
                                    <p className="text-gray-500 text-xs">
                                        {selectedArticle.readTime} dk okuma
                                    </p>
                                </div>

                                {/* Article body */}
                                <div className="prose-sm text-gray-300 text-sm leading-relaxed space-y-3">
                                    {selectedArticle.body.split('\n\n').map((paragraph, i) => {
                                        if (paragraph.startsWith('**') && paragraph.endsWith('**')) {
                                            return (
                                                <h3 key={i} className="text-white font-semibold text-base mt-4">
                                                    {paragraph.replace(/\*\*/g, '')}
                                                </h3>
                                            );
                                        }
                                        if (paragraph.includes('\n')) {
                                            return (
                                                <div key={i}>
                                                    {paragraph.split('\n').map((line, j) => {
                                                        if (line.startsWith('**') && line.endsWith('**')) {
                                                            return (
                                                                <h3 key={j} className="text-white font-semibold text-base mt-4 mb-2">
                                                                    {line.replace(/\*\*/g, '')}
                                                                </h3>
                                                            );
                                                        }
                                                        if (line.match(/^\d+\./)) {
                                                            return <p key={j} className="text-gray-300 text-sm pl-2">{line}</p>;
                                                        }
                                                        if (line.startsWith('- ')) {
                                                            return <p key={j} className="text-gray-300 text-sm pl-2">â€¢ {line.slice(2)}</p>;
                                                        }
                                                        return line ? <p key={j} className="text-gray-300 text-sm">{line}</p> : null;
                                                    })}
                                                </div>
                                            );
                                        }
                                        return <p key={i} className="text-gray-300 text-sm">{paragraph}</p>;
                                    })}
                                </div>

                                {/* Close */}
                                <button
                                    onClick={() => setSelectedArticle(null)}
                                    className="w-full mt-6 bg-white/5 text-gray-400 hover:text-white py-3 rounded-xl text-sm transition-colors"
                                >
                                    Kapat
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <BottomNav />
        </div>
    );
}

