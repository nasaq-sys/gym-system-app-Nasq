"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  MessageCircle,
  X,
  RotateCcw,
  Sparkles,
  Loader2,
  Phone,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/useI18n";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGymWhatsApp } from "@/hooks/useGymWhatsApp";
import { WhatsAppIcon } from "@/components/shared/SocialIcons";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface FaqQuestion {
  id: string;
  order: number;
  qAr: string;
  qEn: string;
  aAr: string;
  aEn: string;
}

interface FaqCategory {
  name: string;
  questions: FaqQuestion[];
}

export default function ChatWidget() {
  const { t, locale } = useI18n();
  const pathname = usePathname();
  const isWorkoutsPage = pathname === "/workouts";
  const { isLinked, openWhatsApp, displayPhone } = useGymWhatsApp();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [categories, setCategories] = useState<FaqCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const didInit = useRef(false);
  const isRTL = locale === "ar";

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    setLoading(true);
    fetch("/api/chat/faq")
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        const cats = res?.data?.categories;
        if (Array.isArray(cats) && cats.length > 0) {
          setCategories(cats);
          setActiveCategory((cur) => cur ?? cats[0].name);
        } else {
          setLoadError(true);
        }
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  const handleOpen = () => setOpen(true);

  const handleClose = () => {
    setOpen(false);
  };

  const clearChat = () => {
    setMessages([]);
  };

  const ask = (q: FaqQuestion) => {
    const question = isRTL ? q.qAr || q.qEn : q.qEn || q.qAr;
    const answer = isRTL ? q.aAr || q.aEn : q.aEn || q.aAr;
    if (!question || !answer) return;
    setMessages((prev) => [
      ...prev,
      { role: "user", content: question },
      { role: "assistant", content: answer },
    ]);
  };

  const activeQuestions =
    categories.find((c) => c.name === activeCategory)?.questions ?? [];

  const showGreeting = messages.length === 0;

  // Chat Assistant only appears on the Home page per user specification
  const isHomePage = pathname === "/home" || pathname === "/";
  if (!isHomePage && !open) {
    return null;
  }

  return (
    <>
      {/* Launcher bubble */}
      {!open && (
        <Button
          onClick={handleOpen}
          aria-label={t("chat.launcher")}
          title={t("chat.launcher")}
          className="chat-widget-launcher fixed bottom-28 md:bottom-6 end-5 md:end-6 z-40 rounded-2xl px-4 py-6 shadow-xl gap-2 h-auto"
        >
          <MessageCircle className="w-5 h-5" />
          <span className="hidden sm:inline text-sm font-semibold">
            {t("chat.title")}
          </span>
        </Button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-0 md:bottom-6 end-0 md:end-6 z-50 w-full md:w-[380px] h-[85vh] md:h-[600px] max-h-[90vh] flex flex-col bg-card border border-border rounded-none md:rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-card border-b border-border shrink-0">
            <div className="w-9 h-9 bg-primary/15 text-primary rounded-xl flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground leading-tight">
                {t("chat.title")}
              </p>
              <p className="text-xs text-foreground/70 leading-tight truncate">
                {t("chat.subtitle")}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={clearChat}
              aria-label={t("chat.clear")}
              className="w-8 h-8 text-foreground/70 hover:text-foreground"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              aria-label="Close"
              className="w-8 h-8 text-foreground/70 hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-background"
            dir={isRTL ? "rtl" : "ltr"}
          >
            {showGreeting ? (
              <div className="self-start max-w-[85%] bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-foreground whitespace-pre-line shadow-xs">
                {t("chat.greeting")}
              </div>
            ) : (
              messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "max-w-[85%] px-4 py-3 text-sm whitespace-pre-line shadow-xs",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-2xl rounded-br-sm self-end font-medium ms-auto"
                      : "bg-card border border-border text-foreground rounded-2xl rounded-bl-sm self-start me-auto"
                  )}
                >
                  {msg.content}
                </div>
              ))
            )}
          </div>

          {/* Dynamic WhatsApp direct contact card */}
          {isLinked && (
            <div className="px-3 py-2 bg-muted/15 border-t border-border shrink-0">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-gradient-to-r from-emerald-500/15 via-card to-card border border-emerald-500/25 text-foreground gap-2">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="relative w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-500 flex items-center justify-center shrink-0 border border-emerald-500/30">
                    <WhatsAppIcon className="w-4 h-4" />
                    <span className="absolute -top-0.5 -right-0.5 flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-foreground leading-tight truncate">
                      {t("whatsapp.contactGym")}
                    </p>
                    <p className="text-3xs font-medium text-emerald-400/90 leading-tight truncate mt-0.5">
                      {displayPhone || t("whatsapp.chatWithAdmin")}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => openWhatsApp()}
                  className="h-7 px-2.5 rounded-lg text-2xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white gap-1 shrink-0 cursor-pointer shadow-sm active:scale-95 transition-all"
                >
                  <Send className="w-3 h-3" />
                  <span>{t("whatsapp.directMessage")}</span>
                </Button>
              </div>
            </div>
          )}

          {/* FAQ navigator */}
          <div
            dir={isRTL ? "rtl" : "ltr"}
            className="bg-card border-t border-border shrink-0"
          >
            {loading ? (
              <div className="p-4 flex items-center justify-center gap-2 text-xs text-foreground/70">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("chat.thinking")}
              </div>
            ) : loadError ? (
              <div className="p-4 text-xs text-foreground/70 text-center">
                {t("chat.apiNotConfigured")}
              </div>
            ) : (
              <>
                {/* Category chips */}
                <div className="flex gap-1.5 overflow-x-auto px-3 pt-2.5 pb-1.5">
                  {categories.map((cat) => (
                    <Badge
                      key={cat.name}
                      variant={activeCategory === cat.name ? "default" : "outline"}
                      onClick={() => setActiveCategory(cat.name)}
                      className="cursor-pointer text-xs py-1 px-3"
                    >
                      {cat.name}
                    </Badge>
                  ))}
                </div>

                {/* Questions grid */}
                <div className="px-3 py-2 max-h-48 overflow-y-auto">
                  {activeQuestions.length === 0 ? (
                    <p className="text-xs text-foreground/70 text-center py-2">
                      {t("chat.error")}
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 gap-1.5">
                      {activeQuestions.map((q) => (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => ask(q)}
                          className="flex items-center gap-2 text-start text-xs bg-muted/40 border border-border rounded-xl px-3 py-2 text-foreground hover:border-primary hover:text-primary transition-colors cursor-pointer w-full"
                        >
                          <MessageCircle className="w-3.5 h-3.5 text-foreground/70 shrink-0" />
                          <span className="min-w-0">
                            {isRTL ? q.qAr || q.qEn : q.qEn || q.qAr}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
