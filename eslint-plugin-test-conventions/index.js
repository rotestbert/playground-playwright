/**
 * Custom ESLint plugin enforcing project test conventions.
 */

/** @type {import('eslint').Rule.RuleModule} */
const noHardcodedTestData = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Disallow hardcoded test data — use factories instead' },
    schema: [],
    messages: {
      hardcodedEmail: 'Hardcoded email "{{value}}" — use a factory (e.g. userFactory.create()).',
      hardcodedPassword: 'Hardcoded password "{{value}}" — use a factory.',
      hardcodedName: 'Hardcoded full name "{{value}}" — use a factory.',
      hardcodedPhone: 'Hardcoded phone number "{{value}}" — use a factory.',
      hardcodedCreditCard: 'Hardcoded credit card number "{{value}}" — use a factory.',
    },
  },
  create(context) {
    const EMAIL_RE = /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i;
    const PHONE_RE = /^\+?[\d\s\-().]{7,}$/;
    const CC_RE = /^\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}$/;
    // Two capitalised words — "John Smith" — but not short labels or test descriptions
    const FULL_NAME_RE = /^[A-Z][a-z]{2,} [A-Z][a-z]{2,}$/;
    // Looks like a real password: letters + digits + special chars, no spaces, ≥8 chars
    const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*()+=[\]{}|;':",.<>?/`~\\]).{8,}$/;

    return {
      Literal(node) {
        if (typeof node.value !== 'string') return;
        const v = node.value.trim();
        if (!v || v.includes(' ') && !FULL_NAME_RE.test(v)) {
          // Skip multi-word strings unless they look like a full name
          if (v.includes(' ') && !FULL_NAME_RE.test(v)) return;
        }

        if (EMAIL_RE.test(v)) {
          context.report({ node, messageId: 'hardcodedEmail', data: { value: v } });
        } else if (CC_RE.test(v)) {
          context.report({ node, messageId: 'hardcodedCreditCard', data: { value: v } });
        } else if (!v.includes(' ') && PHONE_RE.test(v) && v.replace(/\D/g, '').length >= 10) {
          context.report({ node, messageId: 'hardcodedPhone', data: { value: v } });
        } else if (FULL_NAME_RE.test(v)) {
          context.report({ node, messageId: 'hardcodedName', data: { value: v } });
        } else if (!v.includes(' ') && PASSWORD_RE.test(v)) {
          context.report({ node, messageId: 'hardcodedPassword', data: { value: v } });
        }
      },
    };
  },
};

/** @type {import('eslint').Rule.RuleModule} */
const noSkipWithoutTodo = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Require a TODO comment above every skipped test' },
    schema: [],
    messages: {
      missingTodo:
        '"{{method}}" skips a test but has no TODO comment immediately above it.',
    },
  },
  create(context) {
    const SKIP_CALLEE = new Set([
      'test.skip', 'it.skip', 'describe.skip',
      'test.fixme', 'it.fixme',
    ]);

    function getCalleeString(node) {
      if (node.callee.type === 'MemberExpression') {
        const obj = node.callee.object.name ?? node.callee.object?.object?.name;
        const prop = node.callee.property.name;
        return `${obj}.${prop}`;
      }
      return null;
    }

    function hasTodoAbove(node) {
      const sourceCode = context.sourceCode;
      const tokenBefore = sourceCode.getTokenBefore(node, { includeComments: true });
      if (!tokenBefore) return false;
      if (tokenBefore.type !== 'Line' && tokenBefore.type !== 'Block') return false;
      return /TODO/i.test(tokenBefore.value);
    }

    return {
      CallExpression(node) {
        const callee = getCalleeString(node);
        if (callee && SKIP_CALLEE.has(callee)) {
          if (!hasTodoAbove(node)) {
            context.report({ node, messageId: 'missingTodo', data: { method: callee } });
          }
        }
      },
    };
  },
};

/** @type {import('eslint').Rule.RuleModule} */
const requireDescribeItStructure = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Require tests to be nested inside a describe block' },
    schema: [],
    messages: {
      missingDescribe: '"{{method}}" must be nested inside a describe() block.',
    },
  },
  create(context) {
    const TEST_FNS = new Set(['test', 'it']);
    let describeDepth = 0;

    function isDescribeCall(node) {
      if (node.type !== 'CallExpression') return false;
      const callee = node.callee;
      // describe(...) or test.describe(...) or describe.skip(...) etc.
      if (callee.type === 'Identifier' && callee.name === 'describe') return true;
      if (callee.type === 'MemberExpression') {
        const obj = callee.object;
        if (obj?.name === 'describe') return true;
        if (obj?.type === 'Identifier' && callee.property?.name === 'describe') return true;
        // test.describe
        if (obj?.name === 'test' && callee.property?.name === 'describe') return true;
      }
      return false;
    }

    function isTestCall(node) {
      if (node.type !== 'CallExpression') return false;
      const callee = node.callee;
      // test('...') or it('...')
      if (callee.type === 'Identifier' && TEST_FNS.has(callee.name)) return true;
      // test.only / it.only / test.skip / it.skip — but NOT test.describe
      if (
        callee.type === 'MemberExpression' &&
        TEST_FNS.has(callee.object?.name) &&
        callee.property?.name !== 'describe'
      )
        return true;
      return false;
    }

    return {
      CallExpression(node) {
        if (isDescribeCall(node)) describeDepth++;
        if (isTestCall(node) && describeDepth === 0) {
          const name =
            node.callee.type === 'Identifier'
              ? node.callee.name
              : `${node.callee.object?.name}.${node.callee.property?.name}`;
          context.report({ node, messageId: 'missingDescribe', data: { method: name } });
        }
      },
      'CallExpression:exit'(node) {
        if (isDescribeCall(node)) describeDepth--;
      },
    };
  },
};

export default {
  rules: {
    'no-hardcoded-test-data': noHardcodedTestData,
    'no-skip-without-todo': noSkipWithoutTodo,
    'require-describe-it-structure': requireDescribeItStructure,
  },
};
