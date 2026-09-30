import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Tracks login events (one row per SIGNED_IN) and heartbeats a presence row
 * every 60s while the user is signed in. Mount once at the root.
 *
 * IMPORTANT: never `await` inside the onAuthStateChange callback — doing so
 * can deadlock the Supabase auth client and stall every subsequent request
 * (login, queries, etc.). All DB writes are fire-and-forget.
 */
export function usePresence() {
  useEffect(() => {
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
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
      stop();
      activeUserId = uid;
      heartbeat(uid);
      heartbeatTimer = setInterval(() => {
        if (typeof document !== "undefined" && document.hidden) return;
        heartbeat(uid);
      }, 900_000);
    }

    function stop() {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = null;
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
