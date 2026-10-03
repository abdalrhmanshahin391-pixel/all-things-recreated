import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import * as core from "@/lib/challenge.core";
import type { ChallengeResults, ChallengeStatus } from "@/lib/challenge";

export type { ChallengeAdminData, ChallengeAdminSubject } from "@/lib/challenge.core";

/**
 * Challenge mode server functions. They only identify the caller and then hand over to challenge.core.ts,
 * where the rules live. Everything runs with the service role; students never receive correct answers
 * until they finish, and time is measured on the server.
 */

async function caller(): Promise<{ userId: string | null; isAdmin: boolean; db: core.Db }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let userId: string | null = null;
  let isAdmin = false;
  try {
    const authHeader = getRequest()?.headers?.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      if (token && token.split(".").length === 3) {
        const { data: authUser } = await supabaseAdmin.auth.getUser(token);
        if (authUser?.user?.id) {
          userId = authUser.user.id;
          const { data: role } = await supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "admin" });
          isAdmin = Boolean(role);
        }
      }
    }
  } catch (err) {
    console.warn("[challenge] could not verify the caller:", err);
  }
  return { userId, isAdmin, db: supabaseAdmin as core.Db };
}

async function signedIn() {
  const c = await caller();
  if (!c.userId) throw new Error("Please sign in first.");
  return { ...c, userId: c.userId };
}

async function adminOnly() {
  const c = await caller();
  if (!c.isAdmin) throw new Error("Only an admin can manage the challenge.");
  return c;
}

const needCourse = (data: { courseId: string }) => {
  if (!data?.courseId) throw new Error("courseId is required");
  return data;
};

// ------------------------------------------------------------------ student side

export const getChallengeStatusServerFn = createServerFn({ method: "POST" })
  .inputValidator(needCourse)
  .handler(async ({ data }): Promise<ChallengeStatus> => {
    const { userId, isAdmin, db } = await caller();
    return core.getStatus(db, { userId, isAdmin }, data.courseId);
  });

export const declineChallengeServerFn = createServerFn({ method: "POST" })
  .inputValidator(needCourse)
  .handler(async ({ data }) => {
    const { userId, db } = await signedIn();
    return core.decline(db, userId, data.courseId);
  });

export const joinChallengeServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: { courseId: string; displayName: string }) => needCourse(data) && data)
  .handler(async ({ data }) => {
    const { userId, isAdmin, db } = await signedIn();
    return core.join(db, { userId, isAdmin }, data.courseId, data.displayName, Date.now());
  });

export const nextChallengeQuestionServerFn = createServerFn({ method: "POST" })
  .inputValidator(needCourse)
  .handler(async ({ data }) => {
    const { userId, db } = await signedIn();
    return core.nextQuestion(db, userId, data.courseId, Date.now());
  });

export const submitChallengeAnswerServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: { courseId: string; questionId: string; optionIds: string[] }) => {
    if (!data?.courseId || !data?.questionId) throw new Error("courseId and questionId are required");
    if (!Array.isArray(data.optionIds)) throw new Error("optionIds must be a list");
    return data;
  })
  .handler(async ({ data }) => {
    const { userId, db } = await signedIn();
    return core.submitAnswer(db, userId, data.courseId, data.questionId, data.optionIds, Date.now());
  });

export const getChallengeResultsServerFn = createServerFn({ method: "POST" })
  .inputValidator(needCourse)
  .handler(async ({ data }): Promise<ChallengeResults> => {
    const { userId, db } = await signedIn();
    return core.getResults(db, userId, data.courseId);
  });

// ------------------------------------------------------------------ admin side

export const adminGetChallengeServerFn = createServerFn({ method: "POST" })
  .inputValidator(needCourse)
  .handler(async ({ data }) => {
    const { db } = await adminOnly();
    return core.adminGet(db, data.courseId);
  });

export const adminSaveChallengeServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: { courseId: string; enabled: boolean; subjectIds: string[]; count: number; secondsPerQuestion: number }) => {
    if (!data?.courseId) throw new Error("courseId is required");
    return data;
  })
  .handler(async ({ data }) => {
    const { db } = await adminOnly();
    return core.adminSave(db, data);
  });

export const adminResetChallengeServerFn = createServerFn({ method: "POST" })
  .inputValidator(needCourse)
  .handler(async ({ data }) => {
    const { db } = await adminOnly();
    return core.adminReset(db, data.courseId);
  });

export const adminRemoveChallengeParticipantServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: { courseId: string; participantId: string }) => {
    if (!data?.courseId || !data?.participantId) throw new Error("courseId and participantId are required");
    return data;
  })
  .handler(async ({ data }) => {
    const { db } = await adminOnly();
    return core.adminRemoveParticipant(db, data.courseId, data.participantId);
  });
