import { ensureCombinedStemWithStatements } from "@/lib/question-format";
import { stripSourceCitation } from "@/lib/aqua-mcq-forge.explanation";
import {
  CHALLENGE_GRACE_MS,
  challengePoints,
  validateDisplayName,
  type ChallengeQuestion,
  type ChallengeResults,
  type ChallengeReviewItem,
  type ChallengeStatus,
  type LeaderboardRow,
} from "@/lib/challenge";

/**
 * Challenge mode rules. Pure logic over a Supabase-style client (`db`) so it can be tested without a
 * server. Students only ever receive questions WITHOUT their correct answers, and time is measured here
 * on the server, never trusted from the browser. challenge.functions.ts wraps these for the app.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = any;

const chunk = <T,>(list: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

export async function getConfig(db: Db, courseId: string) {
  const { data } = await db.from("course_challenges").select("*").eq("course_id", courseId).maybeSingle();
  return data as null | {
    course_id: string;
    enabled: boolean;
    question_ids: string[];
    subject_ids: string[];
    question_count: number;
    seconds_per_question: number;
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getParticipant(db: Db, courseId: string, userId: string): Promise<null | Record<string, any>> {
  const { data } = await db.from("challenge_participants").select("*").eq("course_id", courseId).eq("user_id", userId).maybeSingle();
  return data ?? null;
}

/** Same access rules as the normal question runner: free course, enrolled, or an active package. */
export async function hasCourseAccess(db: Db, userId: string, courseId: string): Promise<boolean> {
  const { data: course } = await db.from("courses").select("id, price, kind").eq("id", courseId).maybeSingle();
  if (!course || course.kind !== "questions") return false;
  if (Number(course.price ?? 0) <= 0) return true;
  const { data: enrolled } = await db.from("user_courses").select("id").eq("user_id", userId).eq("course_id", courseId).maybeSingle();
  if (enrolled) return true;
  const { data: purchases } = await db.from("package_purchases").select("package_id, status").eq("user_id", userId);
  const packageIds = (purchases ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((p: any) => !p.status || p.status === "active" || p.status === "completed")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((p: any) => p.package_id);
  if (!packageIds.length) return false;
  const { data: link } = await db.from("package_courses").select("id").eq("course_id", courseId).in("package_id", packageIds).limit(1);
  return Boolean(link?.length);
}

/** The frozen question order, minus any question that was deleted since. */
async function liveQueue(db: Db, questionIds: string[]): Promise<string[]> {
  const have = new Set<string>();
  for (const part of chunk(questionIds, 100)) {
    const { data } = await db.from("questions").select("id").in("id", part);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data ?? []).forEach((r: any) => have.add(r.id));
  }
  return questionIds.filter((id) => have.has(id));
}

async function finishIfDone(db: Db, participantId: string, queueLength: number, nowMs: number) {
  const { data: answers } = await db
    .from("challenge_answers")
    .select("points, is_correct, elapsed_ms")
    .eq("participant_id", participantId);
  const list = answers ?? [];
  const done = list.length >= queueLength;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    score: list.reduce((s: number, a: any) => s + a.points, 0),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    correct_count: list.filter((a: any) => a.is_correct).length,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    total_time_ms: list.reduce((s: number, a: any) => s + a.elapsed_ms, 0),
    current_question_id: null,
    current_served_at: null,
  };
  if (done) {
    patch.status = "finished";
    patch.finished_at = new Date(nowMs).toISOString();
    patch.total_questions = queueLength;
  }
  await db.from("challenge_participants").update(patch).eq("id", participantId);
  return { answered: list.length, finished: done };
}

async function recordAnswer(
  db: Db,
  participantId: string,
  secondsPerQuestion: number,
  questionId: string,
  optionIds: string[],
  rawElapsedMs: number,
  queueLength: number,
  nowMs: number,
) {
  const limitMs = secondsPerQuestion * 1000;
  const timedOut = rawElapsedMs > limitMs + CHALLENGE_GRACE_MS;
  const elapsed = Math.min(Math.max(rawElapsedMs, 0), limitMs);
  const { data: opts } = await db.from("question_options").select("id, is_correct").eq("question_id", questionId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const valid = new Set((opts ?? []).map((o: any) => o.id));
  const chosen = [...new Set(optionIds)].filter((id) => valid.has(id));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const correctIds = (opts ?? []).filter((o: any) => o.is_correct).map((o: any) => o.id);
  const isCorrect =
    !timedOut && chosen.length > 0 && chosen.length === correctIds.length && correctIds.every((id: string) => chosen.includes(id));
  const { error } = await db.from("challenge_answers").insert({
    participant_id: participantId,
    question_id: questionId,
    selected_option_ids: timedOut ? [] : chosen,
    is_correct: isCorrect,
    timed_out: timedOut,
    elapsed_ms: elapsed,
    points: challengePoints(isCorrect, elapsed, limitMs),
  });
  if (error) {
    if (error.code === "23505") throw new Error("That question was already answered.");
    throw new Error(error.message);
  }
  return finishIfDone(db, participantId, queueLength, nowMs);
}

// ------------------------------------------------------------------ student side

export async function getStatus(db: Db, who: { userId: string | null; isAdmin: boolean }, courseId: string): Promise<ChallengeStatus> {
  const off: ChallengeStatus = { state: "off", total: 0, secondsPerQuestion: 30, displayName: null };
  const cfg = await getConfig(db, courseId);
  if (!cfg?.enabled || !cfg.question_ids?.length || !who.userId || who.isAdmin) return off;
  if (!(await hasCourseAccess(db, who.userId, courseId))) return off;
  const base = { total: cfg.question_ids.length, secondsPerQuestion: cfg.seconds_per_question };
  const part = await getParticipant(db, courseId, who.userId);
  if (!part) return { ...base, state: "none", displayName: null };
  return { ...base, state: part.status, displayName: part.display_name ?? null };
}

export async function decline(db: Db, userId: string, courseId: string) {
  const cfg = await getConfig(db, courseId);
  if (!cfg?.enabled) return { ok: true };
  const existing = await getParticipant(db, courseId, userId);
  if (existing) {
    if (existing.status === "declined") return { ok: true };
    throw new Error("You already joined this challenge.");
  }
  const { error } = await db.from("challenge_participants").insert({ course_id: courseId, user_id: userId, status: "declined" });
  if (error && error.code !== "23505") throw new Error(error.message);
  return { ok: true };
}

export async function join(db: Db, who: { userId: string; isAdmin: boolean }, courseId: string, displayName: string, nowMs: number) {
  if (who.isAdmin) throw new Error("Admins can't enter the challenge, so the ranking stays fair.");
  const cfg = await getConfig(db, courseId);
  if (!cfg?.enabled || !cfg.question_ids.length) throw new Error("This challenge is not open.");
  if (!(await hasCourseAccess(db, who.userId, courseId))) throw new Error("You don't have access to this course.");

  const checked = validateDisplayName(displayName);
  if (!checked.ok) throw new Error(checked.en);

  const existing = await getParticipant(db, courseId, who.userId);
  if (existing) {
    if (existing.status === "active") return { ok: true, resumed: true };
    throw new Error(existing.status === "finished" ? "You already finished this challenge." : "You chose to ignore this challenge.");
  }
  const queue = await liveQueue(db, cfg.question_ids);
  if (!queue.length) throw new Error("This challenge has no questions left.");

  const { error } = await db.from("challenge_participants").insert({
    course_id: courseId,
    user_id: who.userId,
    status: "active",
    display_name: checked.name,
    started_at: new Date(nowMs).toISOString(),
    total_questions: queue.length,
  });
  if (error) {
    if (error.code === "23505") throw new Error("That name is already taken in this challenge. Try another one.");
    throw new Error(error.message);
  }
  return { ok: true, resumed: false };
}

/** Serves the next unanswered question (without its correct answer) and starts its server-side timer. */
export async function nextQuestion(
  db: Db,
  userId: string,
  courseId: string,
  nowMs: number,
): Promise<{ done: true } | { done: false; question: ChallengeQuestion }> {
  const cfg = await getConfig(db, courseId);
  const part = await getParticipant(db, courseId, userId);
  if (!cfg || !part || part.status !== "active") throw new Error("You are not in an active challenge.");

  const limitMs = cfg.seconds_per_question * 1000;
  const queue = await liveQueue(db, cfg.question_ids);

  const { data: answeredRows } = await db.from("challenge_answers").select("question_id").eq("participant_id", part.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const answered = new Set<string>((answeredRows ?? []).map((r: any) => r.question_id));

  // A question served earlier whose time ran out while the student was away counts as unanswered.
  if (part.current_question_id && part.current_served_at && !answered.has(part.current_question_id)) {
    const elapsed = nowMs - new Date(part.current_served_at).getTime();
    if (elapsed > limitMs + CHALLENGE_GRACE_MS) {
      await recordAnswer(db, part.id, cfg.seconds_per_question, part.current_question_id, [], elapsed, queue.length, nowMs);
      answered.add(part.current_question_id);
      part.current_question_id = null;
      part.current_served_at = null;
    }
  }

  const nextId = queue.find((id) => !answered.has(id));
  if (!nextId) {
    await finishIfDone(db, part.id, queue.length, nowMs);
    return { done: true };
  }

  let servedAt = part.current_question_id === nextId && part.current_served_at ? new Date(part.current_served_at).getTime() : 0;
  if (!servedAt) {
    servedAt = nowMs;
    await db
      .from("challenge_participants")
      .update({ current_question_id: nextId, current_served_at: new Date(servedAt).toISOString() })
      .eq("id", part.id);
  }

  const { data: q } = await db
    .from("questions")
    .select("id, stem, explanation, image_url, answer_mode, question_options(id, label, text, sort_order)")
    .eq("id", nextId)
    .maybeSingle();
  if (!q) throw new Error("A question is missing. Please refresh.");

  const options = ((q.question_options ?? []) as Array<{ id: string; label: string; text: string; sort_order: number }>)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((o) => ({ id: o.id, label: o.label, text: o.text }));
  const stem = ensureCombinedStemWithStatements(q.stem, stripSourceCitation(q.explanation), options);

  return {
    done: false,
    question: {
      id: q.id,
      stem,
      image_url: q.image_url ?? null,
      answer_mode: q.answer_mode === "multiple" ? "multiple" : "single",
      options,
      index: answered.size + 1,
      total: queue.length,
      remainingMs: Math.max(0, limitMs - (nowMs - servedAt)),
    },
  };
}

export async function submitAnswer(
  db: Db,
  userId: string,
  courseId: string,
  questionId: string,
  optionIds: string[],
  nowMs: number,
) {
  const cfg = await getConfig(db, courseId);
  const part = await getParticipant(db, courseId, userId);
  if (!cfg || !part || part.status !== "active") throw new Error("You are not in an active challenge.");
  if (part.current_question_id !== questionId || !part.current_served_at) {
    throw new Error("That question is not the one that is open right now.");
  }
  const queue = await liveQueue(db, cfg.question_ids);
  const elapsed = nowMs - new Date(part.current_served_at).getTime();
  const res = await recordAnswer(db, part.id, cfg.seconds_per_question, questionId, optionIds, elapsed, queue.length, nowMs);
  // Deliberately no verdict here: right answers are revealed only when the challenge is finished.
  return { answered: res.answered, total: queue.length, finished: res.finished };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rankRows(rows: any[], userId: string | null): LeaderboardRow[] {
  const sorted = rows
    .slice()
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.correct_count - a.correct_count ||
        a.total_time_ms - b.total_time_ms ||
        String(a.finished_at).localeCompare(String(b.finished_at)),
    );
  return sorted.map((r, i) => ({
    rank: i + 1,
    displayName: r.display_name as string,
    score: r.score,
    correct: r.correct_count,
    total: r.total_questions,
    timeMs: Number(r.total_time_ms),
    isMe: Boolean(userId) && r.user_id === userId,
  }));
}

export async function getResults(db: Db, userId: string, courseId: string): Promise<ChallengeResults> {
  const cfg = await getConfig(db, courseId);
  const part = await getParticipant(db, courseId, userId);
  if (!cfg || !part || part.status !== "finished") throw new Error("Finish the challenge to see the results.");

  const { data: finished } = await db
    .from("challenge_participants")
    .select("user_id, display_name, score, correct_count, total_questions, total_time_ms, finished_at")
    .eq("course_id", courseId)
    .eq("status", "finished");
  const board = rankRows(finished ?? [], userId);
  const me = board.find((r) => r.isMe)!;

  const queue = await liveQueue(db, cfg.question_ids);
  const { data: myAnswers } = await db.from("challenge_answers").select("*").eq("participant_id", part.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byQuestion = new Map<string, any>((myAnswers ?? []).map((a: any) => [a.question_id, a]));

  const review: ChallengeReviewItem[] = [];
  for (const ids of chunk(queue, 50)) {
    const { data: qs } = await db
      .from("questions")
      .select("id, stem, explanation, image_url, question_options(id, label, text, is_correct, sort_order)")
      .in("id", ids);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const qMap = new Map<string, any>((qs ?? []).map((q: any) => [q.id, q]));
    for (const id of ids) {
      const q = qMap.get(id);
      const a = byQuestion.get(id);
      if (!q || !a) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const options = ((q.question_options ?? []) as any[])
        .slice()
        .sort((x, y) => x.sort_order - y.sort_order)
        .map((o) => ({ id: o.id, label: o.label, text: o.text, is_correct: Boolean(o.is_correct) }));
      const explanation = stripSourceCitation(q.explanation);
      review.push({
        id,
        stem: ensureCombinedStemWithStatements(q.stem, explanation, options),
        image_url: q.image_url ?? null,
        explanation: explanation || null,
        options,
        selectedOptionIds: a.selected_option_ids ?? [],
        isCorrect: a.is_correct,
        timedOut: a.timed_out,
        points: a.points,
        elapsedMs: a.elapsed_ms,
      });
    }
  }

  return { me, leaderboard: board.slice(0, 100), review, maxScore: queue.length * 1000 };
}

// ------------------------------------------------------------------ admin side

export type ChallengeAdminSubject = { id: string; name: string; section: string; count: number };
export type ChallengeAdminData = {
  enabled: boolean;
  secondsPerQuestion: number;
  subjectIds: string[];
  requestedCount: number;
  selectedQuestions: number;
  locked: boolean;
  subjects: ChallengeAdminSubject[];
  stats: { finished: number; active: number; declined: number };
  participants: { id: string; displayName: string; status: string; score: number; correct: number; total: number; timeMs: number }[];
};

export async function adminGet(db: Db, courseId: string): Promise<ChallengeAdminData> {
  const cfg = await getConfig(db, courseId);

  const { data: groups } = await db.from("subject_groups").select("id, name, sort_order").eq("course_id", courseId).order("sort_order");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groupName = new Map<string, string>((groups ?? []).map((g: any) => [g.id, g.name]));
  const subjects: ChallengeAdminSubject[] = [];
  if (groups?.length) {
    const { data: subs } = await db
      .from("subjects")
      .select("id, name, group_id, sort_order")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .in("group_id", (groups as any[]).map((g) => g.id))
      .order("sort_order");
    for (const s of subs ?? []) {
      const { count } = await db.from("questions").select("id", { count: "exact", head: true }).eq("subject_id", s.id);
      subjects.push({ id: s.id, name: s.name, section: groupName.get(s.group_id) ?? "", count: count ?? 0 });
    }
  }

  const { data: parts } = await db
    .from("challenge_participants")
    .select("id, status, display_name, score, correct_count, total_questions, total_time_ms, finished_at, user_id")
    .eq("course_id", courseId);
  const list = parts ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finished = list.filter((p: any) => p.status === "finished");
  const board = rankRows(finished, null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const idByName = new Map<string, string>(finished.map((p: any) => [p.display_name, p.id]));
  const participants = [
    ...board.map((r) => ({
      id: idByName.get(r.displayName)!,
      displayName: r.displayName,
      status: "finished",
      score: r.score,
      correct: r.correct,
      total: r.total,
      timeMs: r.timeMs,
    })),
    ...list
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((p: any) => p.status === "active")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((p: any) => ({
        id: p.id,
        displayName: p.display_name ?? "",
        status: "active",
        score: p.score,
        correct: p.correct_count,
        total: p.total_questions,
        timeMs: Number(p.total_time_ms),
      })),
  ];

  return {
    enabled: Boolean(cfg?.enabled),
    secondsPerQuestion: cfg?.seconds_per_question ?? 30,
    subjectIds: cfg?.subject_ids ?? [],
    requestedCount: cfg?.question_count ?? 0,
    selectedQuestions: cfg?.question_ids?.length ?? 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    locked: list.some((p: any) => p.status === "active" || p.status === "finished"),
    subjects,
    stats: {
      finished: finished.length,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      active: list.filter((p: any) => p.status === "active").length,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      declined: list.filter((p: any) => p.status === "declined").length,
    },
    participants,
  };
}

export async function adminSave(
  db: Db,
  input: { courseId: string; enabled: boolean; subjectIds: string[]; count: number; secondsPerQuestion: number },
) {
  const cfg = await getConfig(db, input.courseId);
  const { count: players } = await db
    .from("challenge_participants")
    .select("id", { count: "exact", head: true })
    .eq("course_id", input.courseId)
    .in("status", ["active", "finished"]);

  // Once anyone has played, the question set and timing are frozen so the ranking stays fair.
  if ((players ?? 0) > 0 && cfg) {
    const { error } = await db
      .from("course_challenges")
      .update({ enabled: input.enabled, updated_at: new Date().toISOString() })
      .eq("course_id", input.courseId);
    if (error) throw new Error(error.message);
    return { ok: true, frozen: true, selected: cfg.question_ids.length };
  }

  const seconds = Math.min(600, Math.max(5, Math.round(Number(input.secondsPerQuestion) || 30)));
  const subjectIds = [...new Set((input.subjectIds ?? []).filter(Boolean))];
  let questionIds: string[] = [];
  if (subjectIds.length) {
    const { data: groups } = await db.from("subject_groups").select("id").eq("course_id", input.courseId);
    const { data: subs } = await db
      .from("subjects")
      .select("id")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .in("group_id", (groups ?? []).map((g: any) => g.id))
      .in("id", subjectIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const valid = (subs ?? []).map((s: any) => s.id as string);
    for (let from = 0; ; from += 1000) {
      const { data: qs } = await db.from("questions").select("id").in("subject_id", valid).order("id").range(from, from + 999);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      questionIds.push(...(qs ?? []).map((q: any) => q.id as string));
      if (!qs || qs.length < 1000) break;
    }
    for (let i = questionIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [questionIds[i], questionIds[j]] = [questionIds[j], questionIds[i]];
    }
    const want = Math.max(0, Math.round(Number(input.count) || 0));
    if (want > 0) questionIds = questionIds.slice(0, want);
  }
  if (input.enabled && questionIds.length === 0) {
    throw new Error("Pick at least one subject that has questions before turning the challenge on.");
  }

  const { error } = await db.from("course_challenges").upsert(
    {
      course_id: input.courseId,
      enabled: input.enabled,
      question_ids: questionIds,
      subject_ids: subjectIds,
      question_count: Math.max(0, Math.round(Number(input.count) || 0)),
      seconds_per_question: seconds,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "course_id" },
  );
  if (error) throw new Error(error.message);
  return { ok: true, frozen: false, selected: questionIds.length };
}

export async function adminReset(db: Db, courseId: string) {
  const { error } = await db.from("challenge_participants").delete().eq("course_id", courseId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function adminRemoveParticipant(db: Db, courseId: string, participantId: string) {
  const { error } = await db.from("challenge_participants").delete().eq("id", participantId).eq("course_id", courseId);
  if (error) throw new Error(error.message);
  return { ok: true };
}
