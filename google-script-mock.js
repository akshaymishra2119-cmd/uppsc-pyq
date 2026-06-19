// ============================================================
// google-script-mock.js
// Intercepts google.script.run calls and routes them to the
// local Express server at /api/<functionName>
// Injected automatically by server.js — do not edit Index.html
// ============================================================

(function () {
  'use strict';

  let _successHandler = null;
  let _failureHandler = null;

  function callApi(fnName, arg) {
    const onSuccess = _successHandler;
    const onFailure = _failureHandler;
    _successHandler = null;
    _failureHandler = null;

    fetch('/api/' + fnName, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(arg !== undefined ? arg : {}),
    })
      .then(r => {
        if (!r.ok) throw new Error('Server error: ' + r.status);
        return r.json();
      })
      .then(data => { if (onSuccess) onSuccess(data); })
      .catch(err => {
        console.error('[google-mock] API error:', fnName, err);
        if (onFailure) onFailure(err);
      });
  }

  // All backend function names from Code.js
  const FUNCTIONS = [
    'getQuestions',
    'getCurrentAffairs',
    'addCurrentAffair',
    'saveProgress',
    'saveBulkProgress',
    'getUserProgress',
    'getLeaderboard',
    'getStats',
    'checkAdmin',
    'getAnalytics',
  ];

  const runObj = {
    withSuccessHandler(fn) {
      _successHandler = fn;
      return runObj;
    },
    withFailureHandler(fn) {
      _failureHandler = fn;
      return runObj;
    },
  };

  FUNCTIONS.forEach(name => {
    runObj[name] = function (arg) {
      callApi(name, arg);
    };
  });

  window.google = { script: { run: runObj } };

  console.log('%c🔧 Local Dev Mode', 'color:#1A73E8;font-weight:bold',
    '— google.script.run → http://localhost:3000/api/*');
})();
