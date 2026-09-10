/* UI language resolution — the ONE copy of this logic.
 *
 * Loaded as a classic (non-module) script from <head> so the tab title, <html lang>
 * and the splash text are already correct before the first paint, i.e. before the
 * app bundle exists. src/i18n.ts calls back into this at runtime instead of
 * re-implementing it, so there is no second copy to keep in sync.
 *
 * Keep it dependency-free, ES5-compatible and side-effect free apart from the
 * <head> work in apply()/applyManifest().
 */
(function (global) {
  var STORAGE_KEY = 'recite:meta';
  // The only strings that must exist before the bundle loads; every other UI string
  // lives in the dictionaries in src/i18n.ts.
  var TITLES = { zh: 'recite · 背单词', en: 'recite · Vocabulary' };
  var BOOT = { zh: '加载中…', en: 'loading…' };

  // 'zh' | 'en' | 'auto'. An explicit pick in Settings always beats the browser.
  function stored() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      var v = raw ? JSON.parse(raw).lang : 'auto';
      return v === 'zh' || v === 'en' ? v : 'auto';
    } catch (e) {
      return 'auto';
    }
  }

  function preferences() {
    return global.navigator.languages && global.navigator.languages.length
      ? global.navigator.languages
      : [global.navigator.language];
  }

  // First entry in the browser's own preference list that we actually ship: a
  // ja/de-first user should still land on their first supported language instead
  // of an arbitrary English. (navigator.language is only the head of that list,
  // and it tracks the *browser's* language, which is not the OS language.)
  function fromBrowser() {
    var list = preferences();
    for (var i = 0; i < list.length; i++) {
      var l = String(list[i] || '').toLowerCase();
      if (l.indexOf('zh') === 0) return 'zh';
      if (l.indexOf('en') === 0) return 'en';
    }
    return 'en';
  }

  function resolve() {
    var s = stored();
    return s === 'auto' ? fromBrowser() : s;
  }

  // True when nothing in the browser's list is a language we ship, so the app is
  // showing a language the user never asked for and should be told why.
  function unsupported() {
    var list = preferences();
    for (var i = 0; i < list.length; i++) {
      var l = String(list[i] || '').toLowerCase();
      if (l.indexOf('zh') === 0 || l.indexOf('en') === 0) return false;
    }
    return true;
  }

  // Raw browser code, for the "why is it this language?" hint in Settings.
  function code() {
    return global.navigator.language || preferences()[0] || '—';
  }

  function title(lang) {
    return TITLES[lang] || TITLES.en;
  }

  function bootText(lang) {
    return BOOT[lang] || BOOT.en;
  }

  // Pre-paint bits. Safe to run before <body> exists.
  function apply() {
    var lang = resolve();
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = title(lang);
    return lang;
  }

  // A manifest is a static file, so it cannot follow the UI language by itself:
  // the build emits a zh variant next to the default one and we point the link at
  // it when we render Chinese. The link tag is injected at the END of <head> by
  // vite-plugin-pwa — after this script — so this has to wait for the DOM.
  function applyManifest() {
    if (resolve() !== 'zh') return;
    var link = document.querySelector('link[rel="manifest"]');
    if (!link) return;
    try {
      link.setAttribute('href', new URL('manifest.zh.webmanifest', link.href).href);
    } catch (e) {
      link.setAttribute('href', 'manifest.zh.webmanifest');
    }
  }

  global.reciteLang = {
    resolve: resolve,
    stored: stored,
    unsupported: unsupported,
    code: code,
    title: title,
    bootText: bootText,
    apply: apply,
    applyManifest: applyManifest,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyManifest);
  else applyManifest();
})(window);
