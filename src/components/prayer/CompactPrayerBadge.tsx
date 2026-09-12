import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { getArmeniaPrayerSummary, type ArmeniaPrayerSummary } from "@/lib/prayer-times";
import { MoonStar } from "lucide-react";

export function CompactPrayerBadge() {
  const [summary, setSummary] = useState<ArmeniaPrayerSummary | null>(null);

  useEffect(() => {
    setSummary(getArmeniaPrayerSummary(new Date()));
    const timer = setInterval(() => {
      setSummary(getArmeniaPrayerSummary(new Date()));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (!summary) return null;

  return (
    <Link
      to="/mentor"
      title={`موعد أذان ${summary.nextPrayerNameAr} بتوقيت أرمينيا (يريفان)`}
      className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 hover:bg-primary/15 border border-primary/20 text-xs font-semibold text-primary transition-all select-none"
    >
      <MoonStar size={13} className="shrink-0" />
      <span>{summary.nextPrayerNameAr}:</span>
      <span className="font-mono font-bold tracking-tight">{summary.timeRemaining.formatted}</span>
    </Link>
  );
}
