import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  const socialImage = new URL("/og.png", metadataBase).toString();

  return {
    metadataBase,
    title: "Hawker Simulator — Build a place everyone can share",
    description:
      "A welcoming, local-first Singapore hawker-centre management game.",
    applicationName: "Hawker Simulator",
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      title: "Hawker Simulator",
      statusBarStyle: "black-translucent",
    },
    openGraph: {
      title: "Hawker Simulator",
      description: "Build a place everyone can share.",
      type: "website",
      images: [
        {
          url: socialImage,
          width: 1733,
          height: 909,
          alt: "An illustrated top-down Hawker Simulator centre filled with stalls, tables, and diners.",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Hawker Simulator",
      description: "Build a place everyone can share.",
      images: [socialImage],
    },
    icons: {
      icon: "/icons/icon.svg",
      shortcut: "/icons/icon.svg",
      apple: "/icons/icon.svg",
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
