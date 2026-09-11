"use client";

import { useState } from "react";
import { Lock, CreditCard } from "lucide-react";
import { useI18n } from "@/hooks/useI18n";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import RenewSubscriptionModal from "@/components/shared/RenewSubscriptionModal";

const SEEN_KEY = "expiredSubModalSeen";

function shouldShow(): boolean {
  try {
    if (sessionStorage.getItem(SEEN_KEY)) return false;
    sessionStorage.setItem(SEEN_KEY, "1");
    return true;
  } catch {
    return true;
  }
}

interface ExpiredSubscriptionModalProps {
  planName?: string;
  subEndDate?: string;
}

export default function ExpiredSubscriptionModal({
  planName,
  subEndDate,
}: ExpiredSubscriptionModalProps) {
  const { t, locale } = useI18n();
  const isAr = locale === "ar";
  const [open, setOpen] = useState(shouldShow);
  const [renewModalOpen, setRenewModalOpen] = useState(false);

  const handleOpenRenew = () => {
    setOpen(false);
    setRenewModalOpen(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[360px] text-center sm:text-center p-6 rounded-3xl border-border/80 shadow-2xl">
          <DialogHeader className="items-center sm:items-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center mx-auto mb-1">
              <Lock className="w-7 h-7" />
            </div>
            <DialogTitle className="text-lg font-black text-center text-foreground">
              {t("expiredModal.title")}
            </DialogTitle>
            <DialogDescription className="text-xs text-foreground/70 leading-relaxed text-center">
              {t("expiredModal.body")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 mt-4">
            <Button
              onClick={handleOpenRenew}
              className="w-full h-11 rounded-xl font-bold text-xs bg-primary text-primary-foreground hover:bg-primary/90 gap-2 shadow-lg shadow-primary/25 cursor-pointer"
            >
              <CreditCard className="w-4 h-4" />
              <span>{t("expiredModal.renew") || (isAr ? "تجديد الاشتراك أونلاين" : "Renew Subscription")}</span>
            </Button>

            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              className="w-full h-9 rounded-xl text-xs font-semibold text-foreground/60 hover:text-foreground hover:bg-muted/40 cursor-pointer"
            >
              {t("expiredModal.dismiss")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <RenewSubscriptionModal
        open={renewModalOpen}
        onOpenChange={setRenewModalOpen}
        currentPlanName={planName}
        currentSubEndDate={subEndDate}
      />
    </>
  );
}

