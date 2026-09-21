const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// ── SVG Templates for Nasaq Gym ──────────────────────────────────────────────

// 1. App Icon SVG (Deep Obsidian background with subtle royal glow and athletic geometric N monogram)
function createAppIconSvg(size = 512, rounded = false) {
  const rx = rounded ? Math.round(size * 0.22) : 0;
  return `<svg width="${size}" height="${size}" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stopColor="#0a0f1d" />
      <stop offset="50%" stopColor="#0f172a" />
      <stop offset="100%" stopColor="#020617" />
    </linearGradient>
    <linearGradient id="mark-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stopColor="#60a5fa" />
      <stop offset="40%" stopColor="#2563eb" />
      <stop offset="100%" stopColor="#1d4ed8" />
    </linearGradient>
    <linearGradient id="accent-glow" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stopColor="#38bdf8" />
      <stop offset="100%" stopColor="#ffffff" />
    </linearGradient>
    <filter id="outer-glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="16" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Background container -->
  <rect width="512" height="512" rx="${rx}" fill="url(#bg-grad)" />

  <!-- Subtle ambient decorative glow rings -->
  <circle cx="256" cy="256" r="210" stroke="#1e3a8a" stroke-width="1.5" stroke-opacity="0.3" stroke-dasharray="8 6" />
  <circle cx="256" cy="256" r="170" stroke="#3b82f6" stroke-width="2" stroke-opacity="0.2" />

  <!-- Glowing background aura behind the mark -->
  <circle cx="256" cy="256" r="120" fill="#2563eb" opacity="0.22" filter="blur(30px)" />

  <!-- Main Athletic Geometry (Nasaq "N" with dynamic power curves) -->
  <g filter="url(#outer-glow)">
    <!-- Left vertical bar -->
    <path
      d="M120 380V132C120 120.954 128.954 112 140 112H168C179.046 112 188 120.954 188 132V305L324 133C331.5 122.5 341 112 356 112H372C383.046 112 392 120.954 392 132V380C392 391.046 383.046 400 372 400H344C332.954 400 324 391.046 324 380V207L188 379C180.5 389.5 171 400 156 400H140C128.954 400 120 391.046 120 380Z"
      fill="url(#mark-grad)"
    />

    <!-- Dynamic Energy Slash -->
    <path
      d="M246 226L282 178"
      stroke="url(#accent-glow)"
      stroke-width="18"
      stroke-linecap="round"
    />

    <!-- Core Focal Point -->
    <circle cx="256" cy="256" r="16" fill="#ffffff" />
  </g>
</svg>`;
}

// 2. Monochrome Notification Badge SVG (Pure white icon mark on transparent background)
function createMonochromeBadgeSvg(size = 96) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path
    d="M20 72V24C20 21.7909 21.7909 20 24 20H30C32.2091 20 34 21.7909 34 24V57L62 25C63.5 23 65.5 20 68 20H72C74.2091 20 76 21.7909 76 24V72C76 74.2091 74.2091 76 72 76H66C63.7909 76 62 74.2091 62 72V39L34 71C32.5 73 30.5 76 28 76H24C21.7909 76 20 74.2091 20 72Z"
    fill="#ffffff"
  />
  <circle cx="48" cy="48" r="4" fill="#ffffff" />
</svg>`;
}

// 3. Full High-Res Brand Logo with Typography
function createFullBrandLogoSvg(width = 1024, height = 1024) {
  return `<svg width="${width}" height="${height}" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stopColor="#080c16" />
      <stop offset="100%" stopColor="#020617" />
    </linearGradient>
    <linearGradient id="mark-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stopColor="#60a5fa" />
      <stop offset="40%" stopColor="#2563eb" />
      <stop offset="100%" stopColor="#1d4ed8" />
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stopColor="#38bdf8" />
      <stop offset="100%" stopColor="#ffffff" />
    </linearGradient>
  </defs>

  <rect width="1024" height="1024" fill="url(#bg)" />

  <!-- Ambient Glow -->
  <circle cx="512" cy="430" r="260" fill="#2563eb" opacity="0.18" filter="blur(60px)" />

  <!-- Emblem -->
  <g transform="translate(256, 174)">
    <path
      d="M120 380V132C120 120.954 128.954 112 140 112H168C179.046 112 188 120.954 188 132V305L324 133C331.5 122.5 341 112 356 112H372C383.046 112 392 120.954 392 132V380C392 391.046 383.046 400 372 400H344C332.954 400 324 391.046 324 380V207L188 379C180.5 389.5 171 400 156 400H140C128.954 400 120 391.046 120 380Z"
      fill="url(#mark-grad)"
    />
    <path d="M246 226L282 178" stroke="url(#accent)" stroke-width="18" stroke-linecap="round" />
    <circle cx="256" cy="256" r="16" fill="#ffffff" />
  </g>

  <!-- Typography -->
  <text x="512" y="740" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans Arabic', sans-serif" font-weight="900" font-size="78" letter-spacing="4" fill="#ffffff">
    NASAQ <tspan fill="#3b82f6">GYM</tspan>
  </text>
  <text x="512" y="805" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans Arabic', sans-serif" font-weight="700" font-size="34" letter-spacing="2" fill="#94a3b8">
    نسق جيم الرياضي
  </text>
  <text x="512" y="855" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="600" font-size="20" letter-spacing="6" fill="#3b82f6" opacity="0.85">
    FITNESS &amp; PERFORMANCE
  </text>
</svg>`;
}

// 4. Portrait Splash Screen (9:16 aspect ratio: 1080x1920)
function createSplashSvg(width = 1080, height = 1920) {
  return `<svg width="${width}" height="${height}" viewBox="0 0 1080 1920" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="splash-bg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stopColor="#080c16" />
      <stop offset="50%" stopColor="#0b1329" />
      <stop offset="100%" stopColor="#020617" />
    </linearGradient>
    <linearGradient id="mark-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stopColor="#60a5fa" />
      <stop offset="40%" stopColor="#2563eb" />
      <stop offset="100%" stopColor="#1d4ed8" />
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stopColor="#38bdf8" />
      <stop offset="100%" stopColor="#ffffff" />
    </linearGradient>
  </defs>

  <rect width="1080" height="1920" fill="url(#splash-bg)" />

  <!-- Ambient Light Sphere -->
  <circle cx="540" cy="880" r="380" fill="#2563eb" opacity="0.22" filter="blur(80px)" />
  <circle cx="540" cy="880" r="320" stroke="#1e40af" stroke-width="2" stroke-opacity="0.3" stroke-dasharray="12 10" />

  <!-- Center Emblem -->
  <g transform="translate(284, 624)">
    <path
      d="M120 380V132C120 120.954 128.954 112 140 112H168C179.046 112 188 120.954 188 132V305L324 133C331.5 122.5 341 112 356 112H372C383.046 112 392 120.954 392 132V380C392 391.046 383.046 400 372 400H344C332.954 400 324 391.046 324 380V207L188 379C180.5 389.5 171 400 156 400H140C128.954 400 120 391.046 120 380Z"
      fill="url(#mark-grad)"
    />
    <path d="M246 226L282 178" stroke="url(#accent)" stroke-width="18" stroke-linecap="round" />
    <circle cx="256" cy="256" r="16" fill="#ffffff" />
  </g>

  <!-- Typography -->
  <text x="540" y="1220" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans Arabic', sans-serif" font-weight="900" font-size="84" letter-spacing="4" fill="#ffffff">
    NASAQ <tspan fill="#3b82f6">GYM</tspan>
  </text>
  <text x="540" y="1290" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans Arabic', sans-serif" font-weight="700" font-size="38" letter-spacing="2" fill="#94a3b8">
    نسق جيم الرياضي
  </text>

  <!-- Footer Tagline -->
  <text x="540" y="1800" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="600" font-size="22" letter-spacing="4" fill="#64748b">
    POWERED BY NASAQ TECH
  </text>
</svg>`;
}

// ── Asset Compilation Runner ──────────────────────────────────────────────────
async function buildAllAssets() {
  console.log('Generating Nasaq Gym brand assets...');

  const icon512Buf = Buffer.from(createAppIconSvg(512, false));
  const icon192Buf = Buffer.from(createAppIconSvg(192, false));
  const appleTouchBuf = Buffer.from(createAppIconSvg(180, false));
  const favicon64Buf = Buffer.from(createAppIconSvg(64, false));
  const badgeMonoBuf = Buffer.from(createMonochromeBadgeSvg(96));
  const fullLogoBuf = Buffer.from(createFullBrandLogoSvg(1024, 1024));
  const splashBuf = Buffer.from(createSplashSvg(1080, 1920));

  // Destination lists
  const tasks = [
    // 1. Web Public Root
    { buf: icon512Buf, size: 512, dest: 'public/icon-512.png' },
    { buf: icon192Buf, size: 192, dest: 'public/icon-192.png' },
    { buf: appleTouchBuf, size: 180, dest: 'public/apple-touch-icon.png' },
    { buf: favicon64Buf, size: 64, dest: 'public/favicon.png' },
    { buf: favicon64Buf, size: 64, dest: 'public/favicon.ico' },
    { buf: icon192Buf, size: 192, dest: 'public/icon-female-192.png' },
    { buf: icon512Buf, size: 512, dest: 'public/icon-female-512.png' },

    // Next.js App Router default icons
    { buf: icon192Buf, size: 192, dest: 'src/app/icon.png' },
    { buf: appleTouchBuf, size: 180, dest: 'src/app/apple-icon.png' },
    { buf: favicon64Buf, size: 64, dest: 'src/app/favicon.ico' },

    // Badges
    { buf: badgeMonoBuf, size: 96, dest: 'public/icons/badge-monochrome.png' },
    { buf: badgeMonoBuf, size: 96, dest: 'public/icons/badge-female-monochrome.png' },
    { buf: badgeMonoBuf, size: 72, dest: 'public/icons/badge-72.png' },
    { buf: badgeMonoBuf, size: 96, dest: 'public/icons/badge-96.png' },
    { buf: badgeMonoBuf, size: 72, dest: 'public/icons/badge-female-72.png' },
    { buf: badgeMonoBuf, size: 96, dest: 'public/icons/badge-female-96.png' },
    { buf: icon192Buf, size: 192, dest: 'public/icons/icon-192.png' },
    { buf: icon512Buf, size: 512, dest: 'public/icons/icon-512.png' },
    { buf: icon192Buf, size: 192, dest: 'public/icons/icon-female-192.png' },
    { buf: icon512Buf, size: 512, dest: 'public/icons/icon-female-512.png' },

    // Brand and Splash Assets
    { buf: fullLogoBuf, size: 1024, dest: 'public/assets/nasaq-gym-logo.png' },
    { buf: fullLogoBuf, size: 1024, dest: 'public/assets/ultra-gym-logo.png' }, // replace old file to prevent stale leaks
    { buf: splashBuf, width: 1080, height: 1920, dest: 'public/assets/splash-9-16.png' },

    // Native Android Copies
    { buf: icon512Buf, size: 512, dest: 'android/app/src/main/assets/public/icon-512.png' },
    { buf: icon192Buf, size: 192, dest: 'android/app/src/main/assets/public/icon-192.png' },
    { buf: appleTouchBuf, size: 180, dest: 'android/app/src/main/assets/public/apple-touch-icon.png' },
    { buf: fullLogoBuf, size: 1024, dest: 'android/app/src/main/assets/public/assets/nasaq-gym-logo.png' },
    { buf: fullLogoBuf, size: 1024, dest: 'android/app/src/main/assets/public/assets/ultra-gym-logo.png' },
    { buf: splashBuf, width: 1080, height: 1920, dest: 'android/app/src/main/assets/public/assets/splash-9-16.png' },

    // Native iOS Copies
    { buf: icon512Buf, size: 512, dest: 'ios/App/App/public/icon-512.png' },
    { buf: icon192Buf, size: 192, dest: 'ios/App/App/public/icon-192.png' },
    { buf: appleTouchBuf, size: 180, dest: 'ios/App/App/public/apple-touch-icon.png' },
    { buf: fullLogoBuf, size: 1024, dest: 'ios/App/App/public/assets/nasaq-gym-logo.png' },
    { buf: fullLogoBuf, size: 1024, dest: 'ios/App/App/public/assets/ultra-gym-logo.png' },
    { buf: splashBuf, width: 1080, height: 1920, dest: 'ios/App/App/public/assets/splash-9-16.png' },
  ];

  for (const t of tasks) {
    const targetDir = path.dirname(t.dest);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const transform = sharp(t.buf);
    if (t.width && t.height) {
      transform.resize(t.width, t.height);
    } else if (t.size) {
      transform.resize(t.size, t.size);
    }
    await transform.png({ quality: 95, compressionLevel: 8 }).toFile(t.dest);
    console.log(`✓ Generated ${t.dest}`);
  }

  console.log('All brand logo assets successfully created and synchronized!');
}

buildAllAssets().catch(err => {
  console.error('Error generating brand assets:', err);
  process.exit(1);
});
