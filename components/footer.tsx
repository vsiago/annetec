import Link from "next/link"
import { Facebook, Instagram, Linkedin, Youtube, Mail, Phone, MapPin } from "lucide-react"

const footerLinks = {
  beneficios: [
    { label: "Plano Odontológico", href: "#odonto" },
    { label: "Benefício Farmácia", href: "#farmacia" },
    { label: "Consultas e Exames", href: "#consultas" },
    { label: "Auxílio Funeral", href: "#funeral" },
    { label: "Benefícios ao Idoso", href: "#idoso" },
  ],
  institucional: [
    { label: "Sobre a Annetec", href: "#sobre" },
    { label: "Club de Vantagens", href: "#vantagens" },
    { label: "Teleorientação", href: "#teleorientacao" },
    { label: "FAQ", href: "#faq" },
    { label: "Fale Conosco", href: "#contato" },
  ],
  legal: [
    { label: "Termos de Uso", href: "#termos" },
    { label: "Política de Privacidade", href: "#privacidade" },
    { label: "Condições Gerais", href: "#condicoes" },
    { label: "Regulamento", href: "#regulamento" },
  ],
}

const socialLinks = [
  { icon: Facebook, href: "#", label: "Facebook" },
  { icon: Instagram, href: "#", label: "Instagram" },
  { icon: Linkedin, href: "#", label: "LinkedIn" },
  { icon: Youtube, href: "#", label: "YouTube" },
]

export function Footer() {
  return (
    <footer className="bg-[#1c3670] text-white">
      {/* Main Footer */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-12">
          {/* Brand */}
          <div className="lg:col-span-2">
            <Link href="/" className="inline-flex items-center gap-2 mb-6">
              <img src="/annetec-light.svg" alt="Annetec" className="h-10" />
            </Link>
            <p className="text-white/70 leading-relaxed mb-6 max-w-sm">
              A Annetec é um Plano de Assistência focado em múltiplos benefícios 
              para melhorar a Saúde & Bem-Estar dos seus associados.
            </p>

            {/* Contact Info */}
            <div className="space-y-3">
              <a 
                href="mailto:contato@annetec.com.br" 
                className="flex items-center gap-3 text-white/70 hover:text-[#e5375b] transition-colors"
              >
                <Mail size={18} />
                <span>contato@annetec.com.br</span>
              </a>
              <a 
                href="tel:08000000000" 
                className="flex items-center gap-3 text-white/70 hover:text-[#e5375b] transition-colors"
              >
                <Phone size={18} />
                <span>0800 000 0000</span>
              </a>
            </div>

            {/* Social Links */}
            <div className="flex gap-4 mt-6">
              {socialLinks.map((social, index) => (
                <a
                  key={index}
                  href={social.href}
                  aria-label={social.label}
                  className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center hover:bg-[#e5375b] transition-colors"
                >
                  <social.icon size={20} />
                </a>
              ))}
            </div>
          </div>

          {/* Benefícios */}
          <div>
            <h3 className="font-bold text-lg mb-4">Benefícios</h3>
            <ul className="space-y-3">
              {footerLinks.beneficios.map((link, index) => (
                <li key={index}>
                  <Link 
                    href={link.href}
                    className="text-white/70 hover:text-[#e5375b] transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Institucional */}
          <div>
            <h3 className="font-bold text-lg mb-4">Institucional</h3>
            <ul className="space-y-3">
              {footerLinks.institucional.map((link, index) => (
                <li key={index}>
                  <Link 
                    href={link.href}
                    className="text-white/70 hover:text-[#e5375b] transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="font-bold text-lg mb-4">Legal</h3>
            <ul className="space-y-3">
              {footerLinks.legal.map((link, index) => (
                <li key={index}>
                  <Link 
                    href={link.href}
                    className="text-white/70 hover:text-[#e5375b] transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-white/50 text-sm text-center md:text-left">
              © {new Date().getFullYear()} Annetec. Todos os direitos reservados.
            </p>
            <p className="text-white/50 text-sm">
              Desenvolvido por{" "}
              <a 
                href="https://annetec.com.br" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-[#e5375b] hover:underline"
              >
                ANNETEC
              </a>
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
