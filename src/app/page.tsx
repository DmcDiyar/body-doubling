import type { Metadata } from 'next';
import Navbar from '@/components/layout/Navbar';
import HeroSection from '@/components/landing/HeroSection';
import PresenceDemo from '@/components/landing/PresenceDemo';
import HowItWorks from '@/components/landing/HowItWorks';
import Rituals from '@/components/landing/Rituals';
import TrustSafety from '@/components/landing/TrustSafety';
import CTASection from '@/components/landing/CTASection';
import Footer from '@/components/landing/Footer';

export const metadata: Metadata = {
  title: 'Sessiz Ortak | Birlikte Odaklan, Sessizce',
  description: 'Sessiz Ortak ile baska biriyle esles ve birlikte odaklan. Konusma yok, sadece varlik. Ücretsiz body doubling deneyimi.',
  keywords: ['sessiz ortak', 'birlikte odaklan', 'body doubling', 'odak oturumu', 'focus timer'],
  openGraph: {
    title: 'Sessiz Ortak | Birlikte Odaklan, Sessizce',
    description: 'Sessiz Ortak ile baska biriyle esles ve birlikte odaklan. Konusma yok, sadece varlik.',
    type: 'website',
  },
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <Navbar />

      {/* Hero Section #1 */}
      <HeroSection />

      {/* Hero Section #2 - Interactive Presence Demo */}
      <PresenceDemo />

      {/* How It Works */}
      <HowItWorks />

      {/* Rituals */}
      <Rituals />

      {/* Trust & Safety */}
      <TrustSafety />

      {/* CTA Conversion Zone */}
      <CTASection />

      {/* Footer */}
      <Footer />
    </div>
  );
}

