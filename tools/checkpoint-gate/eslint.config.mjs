// The checkpoint gate's code-health rules, for front end and server alike.
//
// These are not style rules. Each one marks code that is hard to review, test
// or change safely. The gate runs them on the PR and on its base and fails only
// on violations the PR ADDS, so existing debt is reported, never blamed on the
// next person to touch the file.
//
// Undefined names are the apps' own lint (client/eslint.config.js); this file
// only measures shape. Rule names that disable comments refer to are stubbed.

const noop = { create: () => ({}) };

// `<Icon />` uses Icon. Core no-unused-vars cannot see JSX, so mark it used.
const jsxUsesVars = {
  create(context) {
    const root = (n) => (n.type === 'JSXMemberExpression' ? root(n.object) : n);
    return {
      JSXOpeningElement(node) {
        const id = root(node.name);
        if (id.type === 'JSXIdentifier' && !/^[a-z]/.test(id.name)) context.sourceCode.markVariableAsUsed(id.name, node);
        else if (id.type === 'JSXIdentifier' && node.name.type === 'JSXMemberExpression') context.sourceCode.markVariableAsUsed(id.name, node);
      },
    };
  },
};

export default [
  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      'react-hooks': { rules: { 'exhaustive-deps': noop, 'rules-of-hooks': noop } },
      gate: { rules: { 'jsx-uses-vars': jsxUsesVars } },
    },
    rules: {
      'gate/jsx-uses-vars': 'error',
      // Branches in one function. Past 20 nobody can hold every path in their head.
      complexity: ['error', 20],
      // Nesting depth inside a function.
      'max-depth': ['error', 5],
      // A function wanting more than 5 inputs wants an object.
      'max-params': ['error', 5],
      // React screens run long; past this, split the screen into parts.
      'max-lines-per-function': ['error', { max: 250, skipBlankLines: true, skipComments: true }],
      'max-nested-callbacks': ['error', 4],
      // Dead code inside a file: values made and never read, code after a return.
      'no-unused-vars': ['error', {
        args: 'after-used', ignoreRestSiblings: true, caughtErrors: 'none',
        varsIgnorePattern: '^(_|React$)', argsIgnorePattern: '^_',
      }],
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-self-assign': 'error',
    },
  },
];
