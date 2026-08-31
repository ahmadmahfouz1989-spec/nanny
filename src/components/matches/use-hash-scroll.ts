import { useEffect } from "react";

/**
 * Scrolls to (and briefly highlights) the element whose id matches the URL
 * hash — used to land on a specific match card from a notification link.
 * Re-runs on hashchange so it works even when already on the page.
 */
export function useHashScroll(ready: boolean) {
  useEffect(() => {
    if (!ready) return;

    function scrollToHash() {
      const id = window.location.hash.slice(1);
      if (!id) return;
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary");
      window.setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 2000);
    }

    const initial = window.setTimeout(scrollToHash, 100);
    window.addEventListener("hashchange", scrollToHash);
    return () => {
      window.clearTimeout(initial);
      window.removeEventListener("hashchange", scrollToHash);
    };
  }, [ready]);
}
