/**
 * The app's opening: picks up from the splash screen (the logo with
 * "ouiKnow" under it, same size and place) and brings it to life -- the two
 * halves draw back and hug, the yellow dot hops and lands -- with a short
 * chime, then fades into the app. Tap to skip.
 *
 * Only in the iOS/Android app, once per launch (a fresh launch starts a new
 * web view, so sessionStorage is empty), never with reduced motion. Plain
 * script rather than React: it runs while the page is still loading, before
 * anything else shows. It only toggles classes on its own element, which
 * React leaves alone (suppressHydrationWarning).
 */
const SCRIPT = `
(function () {
  var el = document.getElementById('app-intro');
  if (!el) return;
  try {
    if (navigator.userAgent.indexOf('ouiKnowApp') < 0) return;
    if (sessionStorage.getItem('ouiknow_intro')) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    sessionStorage.setItem('ouiknow_intro', '1');
  } catch (e) { return; }

  el.classList.add('intro-on');
  var audio = new Audio('/intro/chime.m4a');
  audio.preload = 'auto';
  var started = false, ended = false;

  function end(fast) {
    if (ended) return;
    ended = true;
    el.classList.add(fast ? 'intro-skip' : 'intro-out');
    if (fast) { try { audio.pause(); } catch (e) {} }
    setTimeout(function () { el.classList.add('intro-done'); }, fast ? 200 : 450);
  }
  function start() {
    if (started) return;
    started = true;
    el.classList.add('intro-run');
    try { var p = audio.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
    setTimeout(function () { end(false); }, 1500);
  }

  el.addEventListener('click', function () { end(true); });
  // The three layers are in this page's HTML, so they're already loading.
  var imgs = el.querySelectorAll('img');
  var waiting = imgs.length;
  function one() { if (--waiting <= 0) start(); }
  for (var i = 0; i < imgs.length; i++) {
    if (imgs[i].complete) one(); else { imgs[i].addEventListener('load', one); imgs[i].addEventListener('error', one); }
  }
  // Slow network: don't hold the app back.
  setTimeout(function () { if (!started) end(true); }, 4000);
})();
`;

export default function AppIntro() {
  return (
    <>
      <div id="app-intro" className="app-intro" aria-hidden="true" suppressHydrationWarning>
        <div className="app-intro-mark">
          {/* eslint-disable-next-line @next/next/no-img-element -- plain img: must load before React runs */}
          <img src="/intro/teal.png" alt="" className="app-intro-teal" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/intro/coral.png" alt="" className="app-intro-coral" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/intro/sun.png" alt="" className="app-intro-sun" />
        </div>
        <div className="app-intro-word">ouiKnow</div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />
    </>
  );
}
