import type { Metadata } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import "./globals.css";

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: "Alertas de vuelos",
  description: "Vigila rutas y recibe un aviso cuando el precio baje de tu tope.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${barlow.variable} ${barlowCondensed.variable} antialiased`}>
      <body>{children}</body>
    </html>
  );
}
