import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  full_name: string;
  username: string;
  email: string;
  phone: string | null;
};

export type AuthSnapshot = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isRealAdmin: boolean;
  isTeacher: boolean;
  isCommittee: boolean;
  isCommitteeEn: boolean;
  isCommitteeAr: boolean;
  isCommitteeHead: boolean;
  isGolden: boolean;
  isQa: boolean;
  /** true until the very first session check resolves */
  loading: boolean;
};

const EMPTY: AuthSnapshot = {
  session: null,
  user: null,
  profile: null,
  isRealAdmin: false,
  isTeacher: false,
  isCommittee: false,
  isCommitteeEn: false,
  isCommitteeAr: false,
  isCommitteeHead: false,
  isGolden: false,
  isQa: false,
  loading: true,
};

// One shared snapshot for the entire app. Previously every component that
// called useAuth() opened its own auth listener and ran its own profile/roles
// queries — with 70+ call sites that meant dozens of duplicate requests per
// page load, which is what made navigation feel slow and made the header
// flash "signed out" before settling.
let snapshot: AuthSnapshot = EMPTY;
const serverSnapshot: AuthSnapshot = EMPTY;
const listeners = new Set<() => void>();
let started = false;
let extrasFor: string | null = null;
// Users whose profile/roles have actually finished loading. `extrasFor` only
// says a fetch has *started*, so it must never be used to clear `loading` —
// doing so let admin pages read isRealAdmin=false and redirect home.
const extrasLoaded = new Set<string>();

function emit(next: Partial<AuthSnapshot>) {
  snapshot = { ...snapshot, ...next };
  for (const l of listeners) l();
}

async function loadExtras(uid: string) {
  if (extrasFor === uid) return;
  extrasFor = uid;
  const [{ data: prof }, { data: roles }, { data: committeeEnContent }, { data: teacherContent }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", uid),
    (supabase.from as any)("site_content").select("value_en").eq("key", "committee_en_user_ids").maybeSingle(),
    (supabase.from as any)("site_content").select("value_en").eq("key", "teacher_user_ids").maybeSingle(),
  ]);
  // A newer auth event may have landed while we were fetching.
  if (snapshot.user?.id !== uid) return;
  extrasLoaded.add(uid);
  const list = (roles ?? []) as { role: string }[];

  let persistentCommitteeEn = false;
  if (committeeEnContent?.value_en) {
    try {
      const ids = JSON.parse(committeeEnContent.value_en);
      if (Array.isArray(ids) && ids.includes(uid)) persistentCommitteeEn = true;
    } catch {}
  }

  let persistentTeacher = false;
  if (teacherContent?.value_en) {
    try {
      const ids = JSON.parse(teacherContent.value_en);
      if (Array.isArray(ids) && ids.includes(uid)) persistentTeacher = true;
    } catch {}
  }

  const isTeacher = persistentTeacher || list.some((r) => r.role === "teacher");
  const isCommitteeAr = list.some((r) => r.role === "committee");
  const isCommitteeEn = persistentCommitteeEn || list.some((r) => r.role === "committee_en");
  const isCommitteeHead = list.some((r) => r.role === "committee_head");
  const isCommittee = isCommitteeAr || isCommitteeEn || isCommitteeHead;

  emit({
    profile: (prof as Profile | null) ?? null,
    isRealAdmin: list.some((r) => r.role === "admin"),
    isTeacher,
    isCommittee,
    isCommitteeEn,
    isCommitteeAr,
    isCommitteeHead,
    isGolden: list.some((r) => r.role === "golden"),
    isQa: list.some((r) => r.role === "qa"),
    // Roles are part of "who is this user" — admin pages redirect on
    // !isAdmin, so loading must not clear before the roles are known.
    loading: false,
  });
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;

  supabase.auth.onAuthStateChange((event, s) => {
    // TOKEN_REFRESHED / INITIAL_SESSION carry the same identity; re-emitting
    // on those churns every subscriber for no reason.
    if (event === "TOKEN_REFRESHED") return;
    const uid = s?.user?.id ?? null;
    const changed = uid !== (snapshot.user?.id ?? null);
    if (!uid) {
      extrasFor = null;
      extrasLoaded.clear();
      emit({ session: null, user: null, profile: null, isRealAdmin: false, isTeacher: false, isCommittee: false, isCommitteeEn: false, isCommitteeAr: false, isCommitteeHead: false, isGolden: false, isQa: false, loading: false });
      return;
    }
    emit({ session: s, user: s?.user ?? null, loading: !extrasLoaded.has(uid) });
    if (changed || event === "USER_UPDATED") {
      if (event === "USER_UPDATED") {
        extrasFor = null;
        extrasLoaded.delete(uid);
      }
      void loadExtras(uid);
    }
  });

  void (async () => {
    const { data } = await supabase.auth.getSession();
    let s = data.session ?? null;
    // A stored session whose access token expired while the app was closed must
    // be renewed, not treated as "signed out". But a visitor who was never
    // signed in has nothing to renew — asking anyway used to cost every
    // first-time visitor a network round trip plus an 800ms sleep before the
    // app could settle. So only attempt the renew when a stored token exists.
    if (!s?.user && hasStoredSession()) {
      try {
        const { data: r } = await supabase.auth.refreshSession();
        s = r.session ?? null;
      } catch {
        /* offline / transient — the auth listener will pick it up later */
      }
    }
    if (!s?.user) {
      emit({ session: null, user: null, loading: false });
      return;
    }
    emit({ session: s, user: s.user, loading: !extrasLoaded.has(s.user.id) });
    await loadExtras(s.user.id);
  })();
}

/** True when this browser has a Supabase auth token stored from a past visit. */
function hasStoredSession(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) return true;
    }
  } catch {
    /* storage blocked */
  }
  return false;
}

/**
 * Resolve as soon as the shared auth store knows who the visitor is (session
 * *and* profile/roles). Used by the OAuth callback so it can hand off the
 * instant the session lands instead of polling on a fixed cadence.
 */
export function waitForAuthSettled(timeoutMs = 8000): Promise<AuthSnapshot> {
  start();
  if (!snapshot.loading) return Promise.resolve(snapshot);
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      unsub();
      resolve(snapshot);
    };
    const timer = setTimeout(finish, timeoutMs);
    const unsub = subscribeAuth(() => {
      if (!snapshot.loading) finish();
    });
  });
}

export function subscribeAuth(cb: () => void) {
  start();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getAuthSnapshot() {
  return snapshot;
}

export function getAuthServerSnapshot() {
  return serverSnapshot;
}

/** Force a refresh of the cached profile/roles (e.g. after editing a profile). */
export async function refreshAuthProfile() {
  const uid = snapshot.user?.id;
  if (!uid) return;
  extrasFor = null;
  extrasLoaded.delete(uid);
  await loadExtras(uid);
}
