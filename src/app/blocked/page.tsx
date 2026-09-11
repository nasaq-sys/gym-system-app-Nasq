export const metadata = {
  title: "تم تقييد الوصول | Nasaq Gym",
  robots: "noindex, nofollow",
};

export default function BlockedPage() {
  return (
    <div
      dir="rtl"
      lang="ar"
      className="dark fixed inset-0 flex items-center justify-center p-6 bg-background"
    >
      <div className="w-full max-w-[420px] text-center rounded-2xl p-10 bg-card border border-border shadow-2xl">
        {/* Icon */}
        <div className="mx-auto mb-5 w-14 h-14 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center">
          <svg
            className="w-8 h-8"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
            <path d="M12 8v4" />
            <path d="M12 16h.01" />
          </svg>
        </div>

        {/* Title */}
        <h1 className="text-[22px] font-bold mb-4 text-primary">
          تم تقييد وصولك
        </h1>

        {/* Body */}
        <p className="text-[15px] leading-[1.7] mb-3 text-foreground/70">
          عذراً، تم حظر عنوان الـ IP الخاص بك من الوصول إلى الموقع بسبب رصد
          نشاط غير معتاد أو مخالفة سياسات الاستخدام.
        </p>

        <p className="text-[15px] leading-[1.7] mb-3 text-foreground/70">
          إذا كنت تعتقد أن هذا حدث بالخطأ، يرجى التواصل معنا لمساعدتك:
        </p>

        {/* Contact Button */}
        <a
          href="mailto:info@nasaqjo.com"
          className="inline-block mt-3 font-bold text-[15px] rounded-xl px-6 py-[11px] no-underline transition-all hover:brightness-110 active:scale-[0.97] bg-primary text-primary-foreground"
        >
          info@nasaqjo.com
        </a>
      </div>
    </div>
  );
}
