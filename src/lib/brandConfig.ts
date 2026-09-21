/**
 * Centralized Brand Configuration for Nasaq Gym
 * تعديل الهوية أو الشعار أو الاسم من هذا الملف المركزي ينعكس على كامل التطبيق
 */

export const BRAND_CONFIG = {
  nameAr: "نسق جيم",
  nameEn: "Nasaq Gym",
  brandPrefix: "Nasaq",
  brandSuffix: "Gym",
  taglineAr: "نظام إدارة اللياقة والتمارين المتكامل",
  taglineEn: "Comprehensive Fitness & Workout Management System",
  logoMarkUrl: "/icon-192.png",
  logoFullUrl: "/assets/nasaq-gym-logo.png",
  faviconUrl: "/favicon.ico",
  appleTouchIconUrl: "/apple-touch-icon.png",
  badgeIconUrl: "/icons/badge-monochrome.png",
  badgeFemaleIconUrl: "/icons/badge-female-monochrome.png",
  colors: {
    primary: "#2563eb",
    primaryDark: "#1d4ed8",
    primaryLight: "#60a5fa",
    accent: "#38bdf8",
    backgroundDark: "#0e0e0e",
    cardDark: "#18181b",
  },
} as const;

export type BrandConfig = typeof BRAND_CONFIG;
