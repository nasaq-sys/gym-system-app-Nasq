import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Arabic } from "next/font/google";
import Script from "next/script";
import { cookies } from "next/headers";
import { ThemeProvider } from "@/lib/ThemeProvider";
import { I18nProvider } from "@/hooks/useI18n";
import InstallPrompt from "@/components/shared/InstallPrompt";
import NotificationOptInModal from "@/components/shared/NotificationOptInModal";
import ServiceWorkerRegister from "@/components/shared/ServiceWorkerRegister";
import PerformanceDiagnostics from "@/components/shared/PerformanceDiagnostics";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import DynamicFavicon from "@/components/shared/DynamicFavicon";
import "./globals.css";
import { cn } from "@/lib/utils";

const notoSansArabic = Noto_Sans_Arabic({
  subsets: ["arabic", "latin"],
  variable: "--font-sans",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ultra Gym - Member Portal",
  description: "Your gym management dashboard",
  applicationName: "Ultra Gym",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-192.png?v=2", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png?v=2", sizes: "512x512", type: "image/png" },
      { url: "/favicon.ico?v=2", sizes: "any" },
    ],
    shortcut: ["/icon-192.png?v=2"],
    apple: [
      { url: "/apple-touch-icon.png?v=2", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Ultra Gym",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f4ee" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0e0e" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const locale = cookieStore.get("gojim_locale")?.value === "en" ? "en" : "ar";

  return (
    <html
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
      className={cn("font-sans", notoSansArabic.variable)}
      suppressHydrationWarning
    >
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Ultra Gym" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png?v=2" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png?v=2" />
        <link rel="shortcut icon" type="image/png" href="/icon-192.png?v=2" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=2" />
        <link rel="manifest" href="/manifest.webmanifest" />

        <Script id="theme-init" strategy="beforeInteractive">
          {`try{var t=localStorage.getItem("gojim_theme")||"dark";var isLight=t==="light"||(t==="system"&&window.matchMedia&&!window.matchMedia("(prefers-color-scheme: dark)").matches);if(isLight){document.documentElement.classList.add("light");document.documentElement.classList.remove("dark");}else{document.documentElement.classList.add("dark");document.documentElement.classList.remove("light");}}catch(e){}`}
        </Script>
        <Script id="pwa-early-capture" strategy="beforeInteractive">
          {`window.__pwaDeferredPrompt=null;window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__pwaDeferredPrompt=e;try{window.dispatchEvent(new CustomEvent("pwa:promptready"))}catch(_){}});`}
        </Script>
      </head>
      <body className="bg-background text-foreground antialiased">
        <ThemeProvider>
          <I18nProvider initialLocale={locale}>
            <TooltipProvider>
              <DynamicFavicon />
              <InstallPrompt />
              <NotificationOptInModal />
              <ServiceWorkerRegister />
              <PerformanceDiagnostics />
              {children}
              <Toaster position="top-center" richColors />
            </TooltipProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
