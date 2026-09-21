"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Eye, EyeOff, User, Lock } from "lucide-react";
import { FacebookIcon, InstagramIcon } from "@/components/shared/SocialIcons";
import { useI18n } from "@/hooks/useI18n";
import BrandLogo from "@/components/shared/BrandLogo";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.data) {
          const roleHome: Record<string, string> = {
            admin: "/home",
            trainer: "/trainer",
            member: "/home",
          };
          const home = roleHome[data.data.role] || "/home";
          router.replace(home);
        }
      })
      .catch(() => {});
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!identifier.trim()) {
      setError(t("auth.emailRequired"));
      return;
    }

    if (!password) {
      setError(t("auth.passwordRequired"));
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          email: identifier.trim(),
          identifier: identifier.trim(),
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(
          data?.error === "invalid_credentials"
            ? t("auth.invalidCredentials")
            : data?.message || t("auth.loginError")
        );
        setLoading(false);
        return;
      }

      const roleHome: Record<string, string> = {
        admin: "/home",
        trainer: "/trainer",
        member: "/home",
      };
      const redirectPath =
        searchParams.get("redirect") || roleHome[data?.data?.role] || "/home";

      // Track IP only if not already tracked on this device
      try {
        if (!localStorage.getItem("ip_tracked")) {
          fetch("/api/track-ip", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({
              recordId: data?.data?.recordId,
              userRole: data?.data?.role,
            }),
          })
            .then((r) => {
              if (r.ok) localStorage.setItem("ip_tracked", "true");
            })
            .catch(() => {});
        }
      } catch {}

      // Small delay to ensure cookie is stored by the browser
      setTimeout(() => {
        window.location.href = redirectPath;
      }, 100);
    } catch {
      setError(t("auth.connectionError"));
      setLoading(false);
    }
  };

  return (
    <div className="dark fixed inset-0 bg-background text-foreground flex items-center justify-center p-4 sm:p-6 z-50 overflow-hidden [color-scheme:dark]">
      {/* Subtle Ambient Glows */}
      <div className="absolute top-1/4 start-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 end-10 w-80 h-80 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md animate-fade-up relative z-10">
        <div className="bg-card border border-border rounded-3xl p-7 sm:p-9 shadow-2xl space-y-6">
          {/* Brand */}
          <div className="flex flex-col items-center text-center space-y-2">
            <BrandLogo size="lg" showSubtext subtext={t("auth.loginSubtitle")} />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} autoComplete="on" className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="identifier"
                className="text-xs font-bold text-foreground/70 block"
              >
                {t("auth.emailLabel")}
              </label>
              <div className="relative">
                <span className="absolute start-3.5 top-1/2 -translate-y-1/2 text-foreground/70 pointer-events-none">
                  <User className="w-4 h-4" />
                </span>
                <input
                  id="identifier"
                  name="username"
                  type="text"
                  inputMode="email"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={t("auth.emailPlaceholder")}
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  dir="ltr"
                  className="w-full bg-input border border-border rounded-xl ps-10 pe-4 py-3 text-sm text-foreground placeholder:text-foreground/70 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="text-xs font-bold text-foreground/70 block"
              >
                {t("auth.passwordLabel")}
              </label>
              <div className="relative">
                <span className="absolute start-3.5 top-1/2 -translate-y-1/2 text-foreground/70 pointer-events-none">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("auth.passwordPlaceholder")}
                  autoComplete="current-password"
                  dir="ltr"
                  className="w-full bg-input border border-border rounded-xl ps-10 pe-12 py-3 text-sm text-foreground placeholder:text-foreground/70 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                  className="absolute end-3 top-1/2 -translate-y-1/2 p-1 text-foreground/70 hover:text-foreground transition-colors cursor-pointer rounded-lg hover:bg-muted"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive text-center font-medium animate-fade-in">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-primary-foreground rounded-xl py-3 font-extrabold text-sm transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-lg mt-2"
            >
              {loading ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  {t("auth.loggingIn")}
                </span>
              ) : (
                t("auth.loginButton")
              )}
            </button>
          </form>

          {/* Social */}
          <div className="pt-4 border-t border-border flex items-center justify-center gap-2">
            <a
              href="https://www.instagram.com/ultragym.jo/?hl=ar"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
              className="w-9 h-9 rounded-xl flex items-center justify-center text-foreground/70 hover:text-primary hover:bg-primary/10 transition-colors"
            >
              <InstagramIcon className="w-4 h-4" />
            </a>
            <a
              href="https://www.facebook.com/UltraGymJo/?locale=ar_AR"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Facebook"
              className="w-9 h-9 rounded-xl flex items-center justify-center text-foreground/70 hover:text-primary hover:bg-primary/10 transition-colors"
            >
              <FacebookIcon className="w-4 h-4" />
            </a>
          </div>
        </div>

        <p className="text-center text-xs text-foreground/70 mt-5">
          ©{" "}
          <a
            href="https://nasaqjo.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary transition-colors font-medium"
          >
            2026 By Nasaq
          </a>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 bg-background flex items-center justify-center">
          <div className="w-10 h-10 border-2 border-border border-t-accent rounded-full animate-spin" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
