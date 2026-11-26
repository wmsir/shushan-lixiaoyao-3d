/**
 * Capacitor Native Android + Mobile Browser Hardware Bridge
 * - Automatically detects Capacitor runtime (Android APK) vs Web browser
 * - Provides tactile haptic impact feedback on sword hits, perfect parries, skill releases, and Boss breaks
 * - Locks landscape immersive display on Android when Capacitor plugins are present
 */

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  Plugins?: {
    Haptics?: {
      impact: (opts: { style: 'LIGHT' | 'MEDIUM' | 'HEAVY' }) => Promise<void>;
      vibrate: (opts?: { duration?: number }) => Promise<void>;
    };
    StatusBar?: {
      hide: () => Promise<void>;
      setOverlaysWebView: (opts: { overlay: boolean }) => Promise<void>;
    };
  };
};

function getCap(): CapacitorGlobal | undefined {
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
}

export function isNativeAndroidApp(): boolean {
  const cap = getCap();
  return Boolean(cap?.isNativePlatform?.());
}

/** Detects Android APK, phones, tablets, coarse-pointer touch screens, or ?mobile override. */
export function isPureMobileDevice(): boolean {
  if (isNativeAndroidApp()) return true;
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has('mobile')) return true;
    if (window.matchMedia?.('(hover: none) and (pointer: coarse)').matches) return true;
  } catch {
    // ignore
  }
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  return /(Android|iPhone|iPad|iPod|Mobile|HarmonyOS)/i.test(ua);
}

export function initNativeShell(): void {
  const cap = getCap();
  if (!cap?.isNativePlatform?.()) return;

  try {
    cap.Plugins?.StatusBar?.setOverlaysWebView({ overlay: true }).catch(() => {});
    cap.Plugins?.StatusBar?.hide().catch(() => {});
  } catch {
    // ignore on web
  }

  // Try locking screen orientation on Android WebView / mobile Chrome
  try {
    const orient = screen.orientation as unknown as { lock?: (mode: string) => Promise<void> };
    orient?.lock?.('landscape').catch(() => {});
  } catch {
    // ignore if unsupported
  }
}

export type HapticStyle = 'light' | 'medium' | 'heavy' | 'parry' | 'ultimate';

export function triggerHaptic(style: HapticStyle): void {
  const cap = getCap();
  const haptics = cap?.Plugins?.Haptics;

  if (haptics) {
    if (style === 'light') {
      haptics.impact({ style: 'LIGHT' }).catch(() => {});
    } else if (style === 'medium') {
      haptics.impact({ style: 'MEDIUM' }).catch(() => {});
    } else if (style === 'heavy') {
      haptics.impact({ style: 'HEAVY' }).catch(() => {});
    } else if (style === 'parry') {
      haptics.impact({ style: 'HEAVY' }).catch(() => {});
      window.setTimeout(() => haptics.impact({ style: 'MEDIUM' }).catch(() => {}), 55);
    } else {
      haptics.vibrate({ duration: 95 }).catch(() => {});
    }
    return;
  }

  // Graceful mobile web Vibration API fallback
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      if (style === 'light') navigator.vibrate(12);
      else if (style === 'medium') navigator.vibrate(24);
      else if (style === 'heavy') navigator.vibrate(42);
      else if (style === 'parry') navigator.vibrate([22, 30, 38]);
      else navigator.vibrate([35, 25, 55]);
    } catch {
      // ignore desktop / unsupported browsers
    }
  }
}
