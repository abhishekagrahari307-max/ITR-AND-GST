/* ===================================================
   TaxMitra – Session bootstrap
   Runs before any data page script. Reads the stored GitHub session,
   points TMStore at that account's namespace and exposes window.TMSession.

   Signed out  → bare tm-* keys (the visitor's own local books, unchanged).
   Signed in   → tm-gh-<login>-* keys, isolated per GitHub account.
   =================================================== */
(function () {
  'use strict';

  var A = window.TMGitHubAuth;
  var S = window.TMStore;

  var session = null;
  var error = null;

  if (A) {
    try {
      session = A.getSession();
    } catch (e) {
      error = e.message;
    }
  }

  var namespace = '';
  if (S) {
    namespace = session && A ? A.profileId(session) : '';
    try {
      S.setNamespace(namespace);
    } catch (e) {
      namespace = '';
    }
  }

  /** Pages call this to decide whether to show admin-only controls. */
  function requireRole(role) {
    if (!session) return { allowed: false, reason: 'signed_out' };
    if (role === 'admin' && session.role !== 'admin') return { allowed: false, reason: 'not_admin' };
    return { allowed: true, reason: 'ok' };
  }

  window.TMSession = {
    session: session,
    error: error,
    namespace: namespace,
    isSignedIn: !!session,
    isAdmin: !!(session && session.role === 'admin'),
    login: session ? session.login : null,
    role: session ? session.role : 'guest',
    signOut: function () {
      if (!A) return;
      A.signOut();
      if (S) S.setNamespace('');
      window.location.reload();
    },
    requireRole: requireRole,
    /** Copy any books kept while signed out into this account. */
    adoptLocalData: function () {
      if (!S || !namespace) return { ok: false, copied: [], reason: 'Sign in first.' };
      var copied = S.migrateNamespace('', namespace);
      return { ok: copied.length > 0, copied: copied };
    }
  };
})();
