import type { Metadata } from "next";
import { Atkinson_Hyperlegible_Next, Atkinson_Hyperlegible_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const atkinson = Atkinson_Hyperlegible_Next({
  variable: "--font-atkinson",
  subsets: ["latin"],
});

const atkinsonMono = Atkinson_Hyperlegible_Mono({
  variable: "--font-atkinson-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "chess-learn", template: "%s · chess-learn" },
  description: "Analyse de mes parties Chess.com avec Stockfish et explications pédagogiques.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${atkinson.variable} ${atkinsonMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        {children}
        <Toaster richColors closeButton />
      </body>
    </html>
  );
}
