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
  isCommittee: boolean;
  /** true until the very first session check resolves */
  loading: boolean;
};

const EMPTY: AuthSnapshot = {
  session: null,
  user: null,
  profile: null,
  isRealAdmin: false,
  isCommittee: false,
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

function emit(next: Partial<AuthSnapshot>) {
  snapshot = { ...snapshot, ...next };
  for (const l of listeners) l();
}

async function loadExtras(uid: string) {
  if (extrasFor === uid) return;
  extrasFor = uid;
  const [{ data: prof }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", uid),
  ]);
  // A newer auth event may have landed while we were fetching.
  if (snapshot.user?.id !== uid) return;
  emit({
    profile: (prof as Profile | null) ?? null,
    isRealAdmin: (roles ?? []).some((r: { role: string }) => r.role === "admin"),
    isCommittee: (roles ?? []).some((r: { role: string }) => r.role === "committee"),
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
      emit({ session: null, user: null, profile: null, isRealAdmin: false, loading: false });
      return;
    }
    emit({ session: s, user: s?.user ?? null, loading: extrasFor !== uid });
    if (changed || event === "USER_UPDATED") {
      if (event === "USER_UPDATED") extrasFor = null;
      void loadExtras(uid);
    }
  });

  void (async () => {
    const { data } = await supabase.auth.getSession();
    const s = data.session ?? null;
    if (!s?.user) {
      emit({ session: null, user: null, loading: false });
      return;
    }
    emit({ session: s, user: s.user, loading: extrasFor !== s.user.id });
    await loadExtras(s.user.id);
  })();
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
  await loadExtras(uid);
}
