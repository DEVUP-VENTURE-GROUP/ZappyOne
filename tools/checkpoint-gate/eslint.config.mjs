// The gate's quality rules, grouped like SonarQube: reliability, security, hotspots, maintainability, accessibility (lib/quality.js maps each rule).
// The gate lints the PR and its base and fails only on what the PR adds, so older debt is shown but never blamed on the next person.
import globals from 'globals';
import sonarjs from 'eslint-plugin-sonarjs';
import security from 'eslint-plugin-security';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

// `<Icon />` uses Icon; core no-unused-vars cannot see JSX.
const jsxUsesVars = {
  create(context) {
    const root = (n) => (n.type === 'JSXMemberExpression' ? root(n.object) : n);
    return {
      JSXOpeningElement(node) {
        const id = root(node.name);
        if (id.type === 'JSXIdentifier' && (!/^[a-z]/.test(id.name) || node.name.type === 'JSXMemberExpression')) context.sourceCode.markVariableAsUsed(id.name, node);
      },
    };
  },
};

// `<Thing />` with no Thing in scope crashes the screen when it opens; the build does not catch it.
const jsxNoUndef = {
  meta: { messages: { undef: "'{{name}}' is used as a component but never defined or imported." } },
  create(context) {
    const root = (n) => (n.type === 'JSXMemberExpression' ? root(n.object) : n);
    return {
      JSXOpeningElement(node) {
        const id = root(node.name);
        if (id.type !== 'JSXIdentifier' || (/^[a-z]/.test(id.name) && node.name.type !== 'JSXMemberExpression')) return;
        for (let s = context.sourceCode.getScope(node); s; s = s.upper) if (s.set.has(id.name)) return;
        context.report({ node: id, messageId: 'undef', data: { name: id.name } });
      },
    };
  },
};

// Raw HTML into the page: a cross-site scripting hotspot to review.
const noDangerousHtml = {
  meta: { messages: { html: 'dangerouslySetInnerHTML puts raw HTML on the page; make sure it is sanitised.' } },
  create: (context) => ({ JSXAttribute(node) { if (node.name?.name === 'dangerouslySetInnerHTML') context.report({ node, messageId: 'html' }); } }),
};

export default [
  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node, ...globals.jest, __APP_VERSION__: 'readonly' },
    },
    plugins: {
      sonarjs, security, 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y,
      gate: { rules: { 'jsx-uses-vars': jsxUsesVars, 'jsx-no-undef': jsxNoUndef, 'no-dangerous-html': noDangerousHtml } },
    },
    rules: {
      'gate/jsx-uses-vars': 'error',

      // Reliability: code that does the wrong thing or crashes.
      'no-undef': 'error',
      'gate/jsx-no-undef': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-dupe-else-if': 'error',
      'no-self-assign': 'error',
      'no-self-compare': 'error',
      'no-cond-assign': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
      'no-unsafe-optional-chaining': 'error',
      'no-unsafe-finally': 'error',
      'no-constant-binary-expression': 'error',
      'no-func-assign': 'error',
      'no-import-assign': 'error',
      'no-loss-of-precision': 'error',
      'no-async-promise-executor': 'error',
      'no-compare-neg-zero': 'error',
      'getter-return': 'error',
      'sonarjs/no-all-duplicated-branches': 'error',
      'sonarjs/no-identical-expressions': 'error',
      'sonarjs/no-identical-conditions': 'error',
      'sonarjs/no-element-overwrite': 'error',
      'sonarjs/no-use-of-empty-return-value': 'error',
      'sonarjs/no-collection-size-mischeck': 'error',
      'sonarjs/no-ignored-return': 'error',
      'sonarjs/no-unthrown-error': 'error',
      'sonarjs/no-misleading-array-reverse': 'error',
      'sonarjs/no-in-misuse': 'error',
      'sonarjs/no-array-delete': 'error',

      // Security: vulnerabilities.
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'security/detect-eval-with-expression': 'error',
      'security/detect-child-process': 'error',
      'security/detect-unsafe-regex': 'error',
      'security/detect-non-literal-require': 'error',
      'security/detect-possible-timing-attacks': 'error',
      'security/detect-new-buffer': 'error',
      'security/detect-buffer-noassert': 'error',
      'security/detect-pseudoRandomBytes': 'error',
      'security/detect-bidi-characters': 'error',
      'sonarjs/no-hardcoded-passwords': 'error',
      'sonarjs/no-hardcoded-ip': 'error',
      'sonarjs/insecure-cookie': 'error',
      'sonarjs/os-command': 'error',

      // Security hotspots: to review, not automatically wrong.
      'sonarjs/pseudo-random': 'warn',
      'sonarjs/hashing': 'warn',
      'sonarjs/no-clear-text-protocols': 'warn',
      'security/detect-non-literal-regexp': 'warn',
      'gate/no-dangerous-html': 'warn',

      // Maintainability: code smells that make code hard to review, test or change.
      'sonarjs/cognitive-complexity': ['error', 15],
      complexity: ['error', 20],
      'max-depth': ['error', 5],
      'max-params': ['error', 5],
      'max-lines-per-function': ['error', { max: 250, skipBlankLines: true, skipComments: true }],
      'max-nested-callbacks': ['error', 4],
      'no-unused-vars': ['error', {
        args: 'after-used', ignoreRestSiblings: true, caughtErrors: 'none',
        varsIgnorePattern: '^(_|React$)', argsIgnorePattern: '^_',
      }],
      'sonarjs/no-identical-functions': 'error',
      'sonarjs/no-collapsible-if': 'error',
      'sonarjs/no-redundant-jump': 'error',
      'sonarjs/no-gratuitous-expressions': 'error',
      'sonarjs/no-inverted-boolean-check': 'error',
      'sonarjs/prefer-single-boolean-return': 'error',
      'sonarjs/no-dead-store': 'error',
      'sonarjs/no-unused-collection': 'error',
      'sonarjs/no-redundant-boolean': 'error',
      'sonarjs/no-useless-catch': 'error',
      'react-hooks/exhaustive-deps': 'error',

      // Accessibility: screens people using a screen reader or keyboard cannot use.
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-has-content': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-proptypes': 'error',
      'jsx-a11y/aria-role': 'error',
      'jsx-a11y/aria-unsupported-elements': 'error',
      'jsx-a11y/role-has-required-aria-props': 'error',
      'jsx-a11y/role-supports-aria-props': 'error',
      'jsx-a11y/heading-has-content': 'error',
      'jsx-a11y/iframe-has-title': 'error',
      'jsx-a11y/img-redundant-alt': 'error',
      'jsx-a11y/no-access-key': 'error',
      'jsx-a11y/no-redundant-roles': 'error',
    },
  },
  // Tests use fake passwords and random ids on purpose; translation files hold the word "password" in every language.
  {
    files: ['**/tests/**', '**/*.test.{js,jsx}', '**/__tests__/**'],
    rules: { 'sonarjs/no-hardcoded-passwords': 'off', 'sonarjs/no-hardcoded-ip': 'off', 'sonarjs/pseudo-random': 'off', 'security/detect-non-literal-require': 'off', 'security/detect-child-process': 'off' },
  },
  {
    files: ['**/i18n/**', '**/translations.js'],
    rules: { 'sonarjs/no-hardcoded-passwords': 'off' },
  },
];
