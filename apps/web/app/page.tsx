import { Navbar } from "@/components/navbar"
import { HeroSection } from "@/components/hero-section"
import { AboutSection } from "@/components/about-section"
import { AudienceSection } from "@/components/audience-section"
import { BenefitsSection } from "@/components/benefits-section"
import { PreventiveSection } from "@/components/preventive-section"
import { DentalSection } from "@/components/dental-section"
import { PharmacySection } from "@/components/pharmacy-section"
import { FuneralSection } from "@/components/funeral-section"
import { ConsultationsSection } from "@/components/consultations-section"
import { ElderlySection } from "@/components/elderly-section"
import { AdvantagesSection } from "@/components/advantages-section"
import { TeleorientationSection } from "@/components/teleorientation-section"
import { FAQSection } from "@/components/faq-section"
import { ContactSection } from "@/components/contact-section"
import { CTASection } from "@/components/cta-section"
import { Footer } from "@/components/footer"

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <HeroSection />
      <AboutSection />
      <AudienceSection />
      <BenefitsSection />
      <PreventiveSection />
      <DentalSection />
      <PharmacySection />
      <FuneralSection />
      <ConsultationsSection />
      <ElderlySection />
      <AdvantagesSection />
      <TeleorientationSection />
      <FAQSection />
      <ContactSection />
      <CTASection />
      <Footer />
    </main>
  )
}
