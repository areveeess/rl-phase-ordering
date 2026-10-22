/* Theme override (?theme=light|dark) and live-server base URL.
   Loaded synchronously in <head> before any paint. Plan 08-03. */
(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  var theme = params.get('theme');
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.setAttribute('data-theme', theme);
  }
  window.CONFIG = { LIVE_BASE: 'http://127.0.0.1:8765' };
})();
