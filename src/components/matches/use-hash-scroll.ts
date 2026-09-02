import { useEffect } from "react";

/**
 * Scrolls to (and briefly highlights) the element whose id matches the URL
 * hash — used to land on a specific match card from a notification link.
 * The hash is cleared immediately after, so navigating back to the page
 * later (e.g. the Dashboard nav link) doesn't re-trigger the jump.
 */
export function useHashScroll(ready: boolean) {
  useEffect(() => {
    if (!ready) return;

    function handle() {
      const id = window.location.hash.slice(1);
      if (!id) return;
      const el = document.getElementById(id);
      // Consume the hash on the first pass regardless, so it can't persist.
      history.replaceState(null, "", window.location.pathname + window.location.search);
      if (!el) return;
      el.scrollIntoView({ block: "center" });
      el.classList.add("ring-2", "ring-primary");
      window.setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 2000);
    }

    const initial = window.setTimeout(handle, 100);
    window.addEventListener("hashchange", handle);
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener("hashchange", handle);
    };
  }, [ready]);
}
