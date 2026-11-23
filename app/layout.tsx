import type { Metadata } from "next";
import { Space_Grotesk, Inter, Geist_Mono } from "next/font/google";
import ConfirmDialogProvider from "./components/ConfirmDialogProvider";
import ToastProvider from "./components/ToastProvider";
import ZoomScope from "./components/ZoomScope";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL || "http://localhost:3000"),
  title: {
    default: "Team Portal",
    template: "%s · Team Portal",
  },
  description: "Portal interno de gestión del guild",
  openGraph: {
    title: "Team Portal",
    description: "Portal interno de gestión del guild",
    images: ["/brand/banner.svg"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${spaceGrotesk.variable} ${inter.variable} ${geistMono.variable}`}>
      <body className="min-h-screen font-body antialiased">
        <ZoomScope>
          <ToastProvider>
            <ConfirmDialogProvider>{children}</ConfirmDialogProvider>
          </ToastProvider>
        </ZoomScope>
      </body>
    </html>
  );
}
