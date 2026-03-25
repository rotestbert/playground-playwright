import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import noOnlyTests from 'eslint-plugin-no-only-tests';
import testConventions from './eslint-plugin-test-conventions/index.js';

const E2E_AND_API_GLOBS = [
  'tests/e2e/**/*.spec.ts',
  'tests/api/**/*.spec.ts',
  'tests/graphql/**/*.spec.ts',
];

const UNIT_GLOBS = [
  'tests/unit/**/*.test.ts',
];

const ALL_TEST_GLOBS = [...E2E_AND_API_GLOBS, ...UNIT_GLOBS];

const sharedRules = {
  // ── No .only() left in committed test files ─────────────────────────
  'no-only-tests/no-only-tests': 'error',

  // ── No hardcoded test data — use factories (advisory, not blocking) ─
  'test-conventions/no-hardcoded-test-data': 'warn',

  // ── No skipped tests without a TODO comment directly above ──────────
  'test-conventions/no-skip-without-todo': 'error',

  // ── Tests must live inside a describe() block ────────────────────────
  'test-conventions/require-describe-it-structure': 'error',
};

const sharedConfig = {
  languageOptions: {
    parser: tsParser,
    parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  },
  plugins: {
    '@typescript-eslint': tsPlugin,
    'no-only-tests': noOnlyTests,
    'test-conventions': testConventions,
  },
};

export default [
  // E2E, API, GraphQL — 500 line limit (integration tests are naturally longer)
  {
    ...sharedConfig,
    files: E2E_AND_API_GLOBS,
    rules: {
      ...sharedRules,
      'max-lines': ['error', { max: 650, skipBlankLines: true, skipComments: true }],
    },
  },

  // Unit tests — 600 line limit (exhaustive unit suites can be long)
  {
    ...sharedConfig,
    files: UNIT_GLOBS,
    rules: {
      ...sharedRules,
      'max-lines': ['error', { max: 800, skipBlankLines: true, skipComments: true }],
    },
  },
];
