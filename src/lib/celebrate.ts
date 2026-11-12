import { haptic } from "@/lib/native-app";

/**
 * A short burst of the logo's colours for the moments worth it: a request
 * sent, a job done, points earned. From the middle of `from` (an element)
 * or the middle of the screen. Plain DOM and the Web Animations API, gone
 * after a second. With reduced motion, just the buzz (in the apps).
 */
const COLOURS = ["#075e62", "#f26b55", "#f4b133", "#2bb3a3"];

export function celebrate(from?: Element | null) {
  haptic("success");
  if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const r = from?.getBoundingClientRect();
  const x = r ? r.left + r.width / 2 : window.innerWidth / 2;
  const y = r ? r.top + r.height / 2 : window.innerHeight / 2.4;
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:90;overflow:hidden";
  document.body.appendChild(layer);
  const N = 26;
  for (let i = 0; i < N; i++) {
    const bit = document.createElement("span");
    const size = 5 + Math.random() * 5;
    const round = Math.random() < 0.5;
    bit.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${size}px;height:${round ? size : size * 0.45}px;border-radius:${round ? "50%" : "1px"};background:${COLOURS[i % COLOURS.length]}`;
    layer.appendChild(bit);
    const angle = (i / N) * Math.PI * 2 + Math.random() * 0.4;
    const dist = 70 + Math.random() * 90;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 40;
    const spin = (Math.random() - 0.5) * 720;
    bit.animate(
      [
        { transform: "translate(-50%,-50%) scale(0.4)", opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${spin / 2}deg) scale(1)`, opacity: 1, offset: 0.45 },
        { transform: `translate(calc(-50% + ${dx * 1.15}px), calc(-50% + ${dy + 90}px)) rotate(${spin}deg) scale(0.8)`, opacity: 0 },
      ],
      { duration: 900 + Math.random() * 300, easing: "cubic-bezier(.2,.7,.4,1)", fill: "forwards" },
    );
  }
  setTimeout(() => layer.remove(), 1400);
}
