// SonarQube-style quality model for the gate: which category each lint rule belongs to, and the A-E ratings for new code.
const SECURITY = /^(no-eval|no-implied-eval|no-new-func)$|^security\/(?!detect-non-literal-regexp)|^sonarjs\/(no-hardcoded-passwords|no-hardcoded-ip|insecure-cookie|os-command)$/;
const HOTSPOT = /^sonarjs\/(pseudo-random|hashing|no-clear-text-protocols)$|^security\/detect-non-literal-regexp$|^gate\/no-dangerous-html$/;
const A11Y = /^jsx-a11y\//;
const MAINTAINABILITY = /^(complexity|max-depth|max-params|max-lines-per-function|max-nested-callbacks|no-unused-vars)$|^sonarjs\/(cognitive-complexity|no-identical-functions|no-collapsible-if|no-redundant-jump|no-gratuitous-expressions|no-inverted-boolean-check|prefer-single-boolean-return|no-dead-store|no-unused-collection|no-redundant-boolean|no-useless-catch)$|^react-hooks\/exhaustive-deps$/;

function categoryOf(rule) {
  if (HOTSPOT.test(rule)) return 'hotspot';
  if (SECURITY.test(rule)) return 'security';
  if (A11Y.test(rule)) return 'a11y';
  if (MAINTAINABILITY.test(rule)) return 'maintainability';
  return 'reliability';
}

// Reliability and security: A with no new issue, then C, D, E as they pile up (SonarQube rates by the worst issue; every new one here blocks).
const ratingByCount = (n) => (n === 0 ? 'A' : n === 1 ? 'C' : n <= 3 ? 'D' : 'E');
// Maintainability: new code smells per 100 added lines.
const ratingBySmells = (smells, addedLines) => {
  const per100 = addedLines ? (smells * 100) / addedLines : smells;
  return per100 === 0 ? 'A' : per100 <= 1 ? 'B' : per100 <= 2 ? 'C' : per100 <= 5 ? 'D' : 'E';
};

module.exports = { categoryOf, ratingByCount, ratingBySmells };
