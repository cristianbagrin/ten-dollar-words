/* challenges: placeholder. UMD so Node can test it. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.TDW = root.TDW || {}; root.TDW.ChallengeRules = factory(); }
})(typeof self !== 'undefined' ? self : this, function () { 'use strict'; return {}; });
