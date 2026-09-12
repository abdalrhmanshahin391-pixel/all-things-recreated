import { Coordinates, CalculationMethod, PrayerTimes, Prayer } from "adhan";

/**
 * Armenia (Yerevan) Geographical Coordinates
 * Latitude: 40.1792° N, Longitude: 44.4991° E
 * Timezone: Asia/Yerevan (UTC+4)
 */
export const ARMENIA_COORDINATES = new Coordinates(40.1792, 44.4991);

export const PRAYER_ARABIC_NAMES: Record<string, string> = {
  fajr: "صلاة الفجر",
  sunrise: "شروق الشمس",
  dhuhr: "صلاة الظهر",
  asr: "صلاة العصر",
  maghrib: "صلاة المغرب",
  isha: "صلاة العشاء",
};

export const PRAYER_SHORT_NAMES: Record<string, string> = {
  fajr: "الفجر",
  sunrise: "الشروق",
  dhuhr: "الظهر",
  asr: "العصر",
  maghrib: "المغرب",
  isha: "العشاء",
};

export type PrayerItem = {
  key: "fajr" | "sunrise" | "dhuhr" | "asr" | "maghrib" | "isha";
  nameAr: string;
  shortName: string;
  time: Date;
  timeFormatted: string;
  isPassed: boolean;
  isNext: boolean;
  isCurrent: boolean;
};

export type ArmeniaPrayerSummary = {
  currentPrayerKey: string;
  nextPrayerKey: string;
  nextPrayerNameAr: string;
  nextPrayerTime: Date;
  timeRemaining: {
    hours: number;
    minutes: number;
    seconds: number;
    totalSeconds: number;
    formatted: string;
  };
  prayers: PrayerItem[];
  nowInArmenia: string;
};

/**
 * Formats a Date object in Armenia local time (HH:mm)
 */
export function formatArmeniaTime(date: Date, includeSeconds = false): string {
  try {
    return date.toLocaleTimeString("en-GB", {
      timeZone: "Asia/Yerevan",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      ...(includeSeconds ? { second: "2-digit" } : {}),
    });
  } catch {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
}

/**
 * Calculates current Armenia prayer times and countdown to next prayer.
 */
export function getArmeniaPrayerSummary(now = new Date()): ArmeniaPrayerSummary {
  const params = CalculationMethod.MuslimWorldLeague();
  const prayerTimes = new PrayerTimes(ARMENIA_COORDINATES, now, params);

  const rawNext = prayerTimes.nextPrayer();
  let nextKey: "fajr" | "sunrise" | "dhuhr" | "asr" | "maghrib" | "isha" = "fajr";
  let nextTime: Date = prayerTimes.fajr;

  if (rawNext === Prayer.None) {
    // Past Isha -> Next is Fajr of tomorrow
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowPrayers = new PrayerTimes(ARMENIA_COORDINATES, tomorrow, params);
    nextKey = "fajr";
    nextTime = tomorrowPrayers.fajr;
  } else {
    nextKey = rawNext as "fajr" | "sunrise" | "dhuhr" | "asr" | "maghrib" | "isha";
    nextTime = prayerTimes.timeForPrayer(rawNext) || prayerTimes.fajr;
  }

  // Calculate remaining time
  const diffMs = Math.max(0, nextTime.getTime() - now.getTime());
  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => String(n).padStart(2, "0");
  const formatted = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

  const currentRaw = prayerTimes.currentPrayer();
  const currentKey = currentRaw === Prayer.None ? "none" : (currentRaw as string);

  const prayerKeys: ("fajr" | "sunrise" | "dhuhr" | "asr" | "maghrib" | "isha")[] = [
    "fajr",
    "sunrise",
    "dhuhr",
    "asr",
    "maghrib",
    "isha",
  ];

  const prayers: PrayerItem[] = prayerKeys.map((k) => {
    const pTime = prayerTimes[k];
    return {
      key: k,
      nameAr: PRAYER_ARABIC_NAMES[k] || k,
      shortName: PRAYER_SHORT_NAMES[k] || k,
      time: pTime,
      timeFormatted: formatArmeniaTime(pTime),
      isPassed: now.getTime() > pTime.getTime(),
      isNext: k === nextKey,
      isCurrent: k === currentKey,
    };
  });

  return {
    currentPrayerKey: currentKey,
    nextPrayerKey: nextKey,
    nextPrayerNameAr: PRAYER_ARABIC_NAMES[nextKey] || nextKey,
    nextPrayerTime: nextTime,
    timeRemaining: {
      hours,
      minutes,
      seconds,
      totalSeconds,
      formatted,
    },
    prayers,
    nowInArmenia: formatArmeniaTime(now, true),
  };
}

/**
 * Checks if browser notifications are supported and permitted.
 */
export async function requestSilentNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return false;
  }
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;

  try {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  } catch {
    return false;
  }
}

/**
 * Dispatches a silent notification (no sound) when a prayer time arrives.
 */
export function sendSilentPrayerNotification(prayerNameAr: string, prayerKey: string) {
  if (typeof window === "undefined") return;

  const todayStr = new Date().toISOString().slice(0, 10);
  const storageKey = `prayer_notified_${todayStr}_${prayerKey}`;

  // Ensure notification is only shown once per prayer per day
  if (localStorage.getItem(storageKey)) {
    return;
  }
  localStorage.setItem(storageKey, "1");

  // 1. Browser Native Notification (Silent: true, zero audio)
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      new Notification(`حان الآن موعد أذان ${prayerNameAr} 🕌`, {
        body: `بتوقيت أرمينيا (يريفان) — حيّ على الصلاة، حيّ على الفلاح.`,
        silent: true,
        icon: "/favicon.ico",
        tag: `adhan-${prayerKey}`,
      });
    } catch {
      // Ignore notification creation errors
    }
  }

  // 2. In-App Sonner Toast Notification (Soundless)
  try {
    import("sonner").then(({ toast }) => {
      toast.info(`حان الآن موعد أذان ${prayerNameAr} 🕌`, {
        description: `حان وقت الصلاة بتوقيت أرمينيا (يريفان). تقبل الله طاعتكم.`,
        duration: 15000,
      });
    });
  } catch {
    // Ignore toast errors
  }
}
