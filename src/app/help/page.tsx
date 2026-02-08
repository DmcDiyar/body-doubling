'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-client';
import { motion } from 'framer-motion';

const FAQ = [
  {
    question: 'Bu uygulama ne yapar?',
    answer: 'Sessizce eşlik eder. Odaklanman için yalnız olmadığını hissettirir.',
  },
  {
    question: 'Sessiz Ortak nedir?',
    answer: 'Kamera zorunluluğu olmayan, sessiz bir odak eşleşmesidir.',
  },
  {
    question: 'Odak oturumu nasıl işler?',
    answer: 'Hemen başlarsın, eşleşirsin ve süre bitince seansı tamamlarsın.',
  },
  {
    question: 'Sorun yaşarsam ne yaparım?',
    answer: 'Önce yeniden dene. Devam ederse çıkış yapıp tekrar giriş yap.',
  },
] as const;

export default function HelpPage() {
  const router = useRouter();

  useEffect(() => {
    const check = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) router.push('/auth');
    };
    check();
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1a1a2e] via-[#16213e] to-[#0f3460] px-4 py-8">
      <div className="max-w-sm mx-auto">
        <div className="mb-8">
          <h1 className="text-white text-xl font-bold mb-1">Yardım</h1>
          <p className="text-gray-500 text-sm">Nasıl çalıştığını öğren</p>
        </div>

        <div className="space-y-3 mb-8">
          {FAQ.map((item) => (
            <motion.div
              key={item.question}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/5 border border-white/10 rounded-2xl p-4"
            >
              <h2 className="text-white text-sm font-semibold mb-2">{item.question}</h2>
              <p className="text-gray-400 text-sm leading-relaxed">{item.answer}</p>
            </motion.div>
          ))}
        </div>

        <button
          onClick={() => router.push('/dashboard')}
          className="w-full py-3 rounded-xl bg-white/10 text-gray-200 hover:bg-white/15 transition-colors"
        >
          Dashboard'a dön
        </button>
      </div>
    </div>
  );
}