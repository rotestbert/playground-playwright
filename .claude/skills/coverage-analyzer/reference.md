# Unit Test — Reference Templates

## Unit Test File Template

```typescript
// tests/unit/<module-path>.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FunctionUnderTest } from '@src/<module-path>.js';

// ─────────────────────────────────────────────────────────────────────────────
// <ModuleName> — <one-line description of what this module does>
// ─────────────────────────────────────────────────────────────────────────────

describe('<FunctionName>', () => {
  // ── Happy Path ─────────────────────────────────────────────────────────────
  describe('happy path', () => {
    it('returns <expected> for valid input', () => {
      const result = FunctionUnderTest('valid-input');
      expect(result).toBe('expected-output');
    });
  });

  // ── Error / invalid input ──────────────────────────────────────────────────
  describe('error cases', () => {
    it('throws when input is null', () => {
      expect(() => FunctionUnderTest(null)).toThrow('Expected error message');
    });

    it('returns undefined for empty string', () => {
      const result = FunctionUnderTest('');
      expect(result).toBeUndefined();
    });
  });

  // ── Branch / edge cases ────────────────────────────────────────────────────
  describe('edge cases', () => {
    it('handles empty array', () => {
      expect(FunctionUnderTest([])).toEqual([]);
    });

    it('handles boundary value zero', () => {
      expect(FunctionUnderTest(0)).toBe(0);
    });
  });
});
```

---

## Async Function Template

```typescript
describe('<AsyncFunctionName>', () => {
  it('resolves with correct value', async () => {
    const result = await asyncFunction('input');
    expect(result).toEqual({ id: 1, name: 'expected' });
  });

  it('rejects with descriptive error on failure', async () => {
    await expect(asyncFunction('bad-input')).rejects.toThrow('Exact error message');
  });
});
```

---

## Mocking Template

```typescript
import { vi } from 'vitest';

// Mock a module dependency
vi.mock('@src/services/some.service.js', () => ({
  someService: {
    fetchData: vi.fn(),
  },
}));

import { someService } from '@src/services/some.service.js';

describe('<FunctionThatCallsService>', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls service with correct args', async () => {
    vi.mocked(someService.fetchData).mockResolvedValue({ id: 1 });

    const result = await functionUnderTest('arg');

    expect(someService.fetchData).toHaveBeenCalledWith('arg');
    expect(result).toEqual({ id: 1 });
  });

  it('propagates service error', async () => {
    vi.mocked(someService.fetchData).mockRejectedValue(new Error('Service down'));

    await expect(functionUnderTest('arg')).rejects.toThrow('Service down');
  });
});
```

---

## Branch Coverage Checklist

When writing tests to cover branches, ensure you have a test for **each arm** of:

| Construct | Arms to cover |
|-----------|---------------|
| `if (cond)` | `cond === true`, `cond === false` |
| `if (cond) ... else if (cond2)` | each branch + fall-through to else |
| `switch (x)` | every `case` + `default` |
| `x ?? y` | `x` is nullish, `x` is defined |
| `x?.y` | `x` is nullish, `x` is defined |
| `x \|\| y` | `x` is falsy, `x` is truthy |
| `x && y` | `x` is falsy, `x` is truthy |
| `cond ? a : b` | `cond === true`, `cond === false` |
| `try/catch` | success path, thrown error path |

---

## Coverage Gap → Test Mapping

Given uncovered lines from the coverage table, locate the corresponding code and write:

```
Uncovered lines: 14-22  →  read src file lines 14-22  →  identify which branch/path is skipped
                             →  write a test that exercises those lines
```

Pattern:
1. Read lines N–M from the source file
2. Determine what input/condition would execute them
3. Write a test that triggers that condition and asserts the correct outcome
