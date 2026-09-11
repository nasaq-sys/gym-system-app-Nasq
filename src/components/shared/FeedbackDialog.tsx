"use client";

import { useState } from "react";
import { useI18n } from "@/hooks/useI18n";
import { Loader2, Send, CheckCircle2, MessageSquareText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function FeedbackDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  const submit = async () => {
    if (!message.trim() || saving) return;
    setSaving(true);
    setStatus("idle");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim() }),
        credentials: "same-origin",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.message || t("feedback.error"));
      }
      setStatus("success");
      setMessage("");
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 text-primary rounded-xl flex items-center justify-center shrink-0">
              <MessageSquareText className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold">{t("feedback.title")}</DialogTitle>
              <DialogDescription className="text-xs text-foreground/70 mt-0.5">
                {t("feedback.subtitle")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {status === "success" && (
            <Alert className="border-success/30 bg-success/10 text-success">
              <CheckCircle2 className="w-4 h-4 text-success" />
              <AlertDescription className="text-xs font-semibold text-success">
                {t("feedback.success")}
              </AlertDescription>
            </Alert>
          )}

          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder={t("feedback.placeholder")}
            className="resize-none"
          />

          {status === "error" && (
            <p className="text-xs font-bold text-destructive">
              {t("feedback.error")}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            onClick={submit}
            disabled={saving || !message.trim()}
            className="w-full"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            <span>{saving ? t("feedback.sending") : t("feedback.send")}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
