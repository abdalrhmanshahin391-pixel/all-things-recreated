export type RiskDevice = {
  ip: string | null;
  platform: string | null;
  last_seen_at: string;
  first_seen_at: string;
};

export type RiskLevel = "low" | "watch" | "high";

export type RiskResult = {
  level: RiskLevel;
  score: number;
  reasons: string[];
};

function network(ip: string | null) {
  if (!ip) return "";
  if (ip.includes(":")) return ip.split(":").slice(0, 3).join(":"); // IPv6 /48-ish
  return ip.split(".").slice(0, 2).join("."); // IPv4 /16-ish
}

/**
 * Heuristic account-sharing score built only from data we already store:
 * device count vs limit, distinct IP networks, distinct platforms and
 * near-simultaneous activity from different devices.
 */
export function scoreSharing(devices: RiskDevice[], limit: number): RiskResult {
  const reasons: string[] = [];
  let score = 0;

  if (devices.length > limit) {
    score += (devices.length - limit) * 25;
    reasons.push(`${devices.length} devices for a ${limit}-device limit`);
  }

  const nets = new Set(devices.map((d) => network(d.ip)).filter(Boolean));
  if (nets.size >= 3) {
    score += (nets.size - 2) * 15;
    reasons.push(`${nets.size} different networks`);
  }

  const platforms = new Set(devices.map((d) => (d.platform ?? "").toLowerCase()).filter(Boolean));
  if (platforms.size >= 3) {
    score += 10;
    reasons.push(`${platforms.size} different platforms`);
  }

  // Two devices active within 10 minutes of each other, from different networks.
  const sorted = [...devices].sort(
    (a, b) => new Date(a.last_seen_at).getTime() - new Date(b.last_seen_at).getTime(),
  );
  for (let i = 1; i < sorted.length; i++) {
    const gap =
      new Date(sorted[i]!.last_seen_at).getTime() - new Date(sorted[i - 1]!.last_seen_at).getTime();
    if (gap < 10 * 60 * 1000 && network(sorted[i]!.ip) !== network(sorted[i - 1]!.ip)) {
      score += 30;
      reasons.push("Two devices active minutes apart from different networks");
      break;
    }
  }

  const level: RiskLevel = score >= 55 ? "high" : score >= 25 ? "watch" : "low";
  return { level, score, reasons };
}
