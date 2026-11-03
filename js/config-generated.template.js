/* Public build-metadata template. This static frontend must never contain provider keys.
   Users may configure their own key through the AI setup page; for shared production
   usage, put keys behind a separately secured server-side proxy. */
'use strict';
window.TAXMITRA_BUILD = window.TAXMITRA_BUILD || {
  hasGemini: false,
  hasOpenRouter: false,
  sha: 'local',
  branch: 'dev',
  developer: 'Abhishek Agrahari'
};
