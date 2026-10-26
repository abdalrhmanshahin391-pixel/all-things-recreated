import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Tracks login events (one row per SIGNED_IN) and writes the presence row once when the user
 * enters the site (page load or sign-in). There is no timer: a timer kept the database awake all day. Mount once at the root.
 *
 * IMPORTANT: never `await` inside the onAuthStateChange callback — doing so
 * can deadlock the Supabase auth client and stall every subsequent request
 * (login, queries, etc.). All DB writes are fire-and-forget.
 */
export function usePresence() {
  useEffect(() => {
    let activeUserId: string | null = null;

    function heartbeat(uid: string) {
      void (supabase.from as any)("user_sessions")
        .upsert(
          { user_id: uid, last_seen_at: new Date().toISOString() },
          { onConflict: "user_id" },
        )
        .then(() => {}, () => {});
    }

    function start(uid: string) {
      // Token refreshes and repeated events for the same user must not write again.
      if (activeUserId === uid) return;
      activeUserId = uid;
      heartbeat(uid);
    }

    function stop() {
      activeUserId = null;
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const uid = session?.user?.id;
      if (event === "SIGNED_IN" && uid) {
        void (supabase.from as any)("user_login_events")
          .insert({ user_id: uid })
          .then(() => {}, () => {});
        start(uid);
      } else if (event === "SIGNED_OUT") {
        stop();
      } else if (event === "TOKEN_REFRESHED" && uid && uid !== activeUserId) {
        start(uid);
      }
    });

    // On first mount, if a session already exists, start heartbeat.
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id;
      if (uid) start(uid);
    }, () => {});

    return () => {
      sub.subscription.unsubscribe();
      stop();
    };
  }, []);
}
