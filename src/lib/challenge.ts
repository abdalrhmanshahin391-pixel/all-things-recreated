/** Challenge mode: shared types, scoring and wording (safe to import in the browser). */

export const CHALLENGE_MAX_POINTS = 1000;
export const CHALLENGE_MIN_CORRECT_POINTS = 500;
/** A little slack for network delay before an unanswered question counts as timed out. */
export const CHALLENGE_GRACE_MS = 2500;

/**
 * Points for one question. A wrong or missing answer earns 0. A correct answer earns 500, plus up to 500
 * more the faster it was given (answered instantly = 1000, at the time limit = 500).
 */
export function challengePoints(correct: boolean, elapsedMs: number, limitMs: number): number {
  if (!correct) return 0;
  const used = Math.min(1, Math.max(0, elapsedMs / Math.max(limitMs, 1)));
  return Math.round(CHALLENGE_MIN_CORRECT_POINTS + (CHALLENGE_MAX_POINTS - CHALLENGE_MIN_CORRECT_POINTS) * (1 - used));
}

/** "preview" is what an admin sees: the challenge is on, but admins don't play. */
export type ChallengeState = "off" | "none" | "declined" | "active" | "finished" | "preview";

export type ChallengeStatus = {
  state: ChallengeState;
  total: number;
  secondsPerQuestion: number;
  displayName: string | null;
  /** The subjects (question groups) the challenge draws from, so the course page can mark them. */
  subjectIds: string[];
};

export type ChallengeQuestion = {
  id: string;
  stem: string;
  image_url: string | null;
  answer_mode: "single" | "multiple";
  options: { id: string; label: string; text: string }[];
  index: number;
  total: number;
  remainingMs: number;
};

export type LeaderboardRow = {
  rank: number;
  displayName: string;
  score: number;
  correct: number;
  total: number;
  timeMs: number;
  isMe: boolean;
};

export type ChallengeReviewItem = {
  id: string;
  stem: string;
  image_url: string | null;
  explanation: string | null;
  options: { id: string; label: string; text: string; is_correct: boolean }[];
  selectedOptionIds: string[];
  isCorrect: boolean;
  timedOut: boolean;
  points: number;
  elapsedMs: number;
};

export type ChallengeResults = {
  me: LeaderboardRow;
  leaderboard: LeaderboardRow[];
  review: ChallengeReviewItem[];
  maxScore: number;
};

/** Display names are public on the leaderboard, so keep them short and free of contact details. */
export function validateDisplayName(raw: string): { ok: true; name: string } | { ok: false; en: string; ar: string } {
  const name = raw.replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 20) {
    return { ok: false, en: "Use 2 to 20 characters.", ar: "استخدم من 2 إلى 20 حرفًا." };
  }
  if (!/^[\p{L}\p{N} _.\-]+$/u.test(name)) {
    return { ok: false, en: "Use only letters, numbers, spaces, dot, dash or underscore.", ar: "استخدم أحرفًا وأرقامًا ومسافات ونقطة وشرطة فقط." };
  }
  if (/https?|www\.|@/i.test(name)) {
    return { ok: false, en: "Do not use links or emails in your name.", ar: "لا تستخدم روابط أو إيميلات في الاسم." };
  }
  return { ok: true, name };
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

export const CHALLENGE_COPY = {
  title: { en: "Challenge mode", ar: "وضع التحدي" },
  intro: {
    en: (n: number, sec: number) => [
      `You are about to enter a one-time challenge: ${n} questions, ${sec} seconds each.`,
      "Correct answers earn points, and faster correct answers earn more. Wrong or unanswered questions earn zero.",
      "You choose a display name for the leaderboard. Your real name is never shown.",
      "The timer keeps running even if you leave the page, and you cannot go back to a question.",
      "The right answers and explanations appear only after you finish.",
      "You can take the challenge only once.",
    ],
    ar: (n: number, sec: number) => [
      `أنت على وشك دخول تحدٍّ لمرة واحدة: ${n} سؤالًا، ولكل سؤال ${sec} ثانية.`,
      "الإجابة الصحيحة تمنحك نقاطًا، وكلما كانت أسرع حصلت على نقاط أكثر. الإجابة الخاطئة أو بدون إجابة لا تمنح نقاطًا.",
      "تختار اسمًا مستعارًا يظهر في لوحة الترتيب، ولن يظهر اسمك الحقيقي أبدًا.",
      "يستمر العدّاد حتى لو غادرت الصفحة، ولا يمكنك الرجوع إلى سؤال سابق.",
      "تظهر الإجابات الصحيحة والشرح بعد أن تنهي التحدي فقط.",
      "يمكنك المشاركة في التحدي مرة واحدة فقط.",
    ],
  },
  warning: {
    en: "If you choose Ignore, you will continue with the normal questions and you will NOT be able to join this challenge later.",
    ar: "إذا اخترت «تجاهل» فستتابع الأسئلة العادية، ولن تتمكن من الانضمام إلى هذا التحدي لاحقًا.",
  },
  join: { en: "Join the challenge", ar: "شارك في التحدي" },
  ignore: { en: "Ignore", ar: "تجاهل" },
  confirmIgnore: {
    en: "Are you sure? You will not be able to join this challenge later.",
    ar: "هل أنت متأكد؟ لن تتمكن من الانضمام إلى هذا التحدي لاحقًا.",
  },
  chooseName: { en: "Choose your leaderboard name", ar: "اختر اسمك في لوحة الترتيب" },
  start: { en: "Start now", ar: "ابدأ الآن" },
};
