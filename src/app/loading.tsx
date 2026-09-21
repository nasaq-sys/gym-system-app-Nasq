import BrandLogo from "@/components/shared/BrandLogo";

export default function RootLoading() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-sm transition-all duration-300">
      {/* Soft Ambient Glow */}
      <div className="absolute w-72 h-72 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center gap-4 animate-fade-in text-center px-4">
        <BrandLogo size="lg" showSubtext subtext="نسق جيم الرياضي" />
        
        {/* Modern Athletic Loading Spinner */}
        <div className="flex items-center gap-2 mt-2">
          <div className="w-5 h-5 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
          <span className="text-xs font-semibold text-foreground/60">
            جاري التحميل...
          </span>
        </div>
      </div>
    </div>
  );
}
