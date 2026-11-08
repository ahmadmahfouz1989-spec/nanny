// The first-open language question (components/language-chooser.tsx).

/** Set once a language has been picked here (a year): the question isn't asked again. */
export const LANGUAGE_CHOSEN_COOKIE = "lang_chosen";

/**
 * Run in the page head: reveals the chooser only when no language
 * has been picked yet, so there's no flash for everyone else.
 */
export const LANGUAGE_ASK_SCRIPT = `
(function () {
  try {
    if (document.cookie.indexOf('${LANGUAGE_CHOSEN_COOKIE}=') === -1) document.documentElement.setAttribute('data-lang-ask', '');
  } catch (e) {}
})();
`;

