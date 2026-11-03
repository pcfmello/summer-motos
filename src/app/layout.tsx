import type { Metadata } from "next";
import { Montserrat } from "next/font/google";

import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

// Montserrat é variável (100–900); exposta como --font-sans, a fonte padrão do Tailwind e do shadcn.
const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "SUMMER",
    template: "%s · SUMMER",
  },
  description: "Gestão de loja de moto peças com oficina",
  applicationName: "SUMMER",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${montserrat.variable} h-full antialiased`}>
      <body className="min-h-full">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
