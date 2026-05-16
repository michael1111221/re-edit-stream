import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Keeps the Supabase session alive in the background:
 * - Refreshes the token every 4 minutes
 * - Refreshes when the tab becomes visible / window regains focus / network comes back
 * - Invalidates react-query data when the token is refreshed or auth state changes,
 *   so RLS-protected lists (mappings, schedules, etc.) reappear automatically.
 */
export function useSessionKeeper() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) return;
        await supabase.auth.refreshSession();
        if (!cancelled) {
          queryClient.invalidateQueries();
        }
      } catch (e) {
        console.warn("[session-keeper] refresh failed", e);
      }
    };

    // Proactive refresh every 4 minutes (tokens default to 1h, plenty of headroom)
    const interval = window.setInterval(refresh, 4 * 60 * 1000);

    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const onOnline = () => refresh();

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", onOnline);

    // Re-fetch data whenever the token is refreshed or the user signs in again
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
        queryClient.invalidateQueries();
      }
    });

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", onOnline);
      subscription.unsubscribe();
    };
  }, [queryClient]);
}
