# coverage-analyzer

Runs unit test coverage, identifies files below threshold, generates targeted tests to fill gaps, then re-runs and reports improvement.

## How to invoke

```
/coverage-analyzer [threshold=<percent>]
```

- `threshold` — minimum acceptable coverage percentage (default: `80`)
- Examples: `/coverage-analyzer`, `/coverage-analyzer threshold=90`

---

## What this skill does — step by step

### 1. Parse arguments

- Extract `threshold` from the invocation args (default `80`).
- Note: the project's `vitest.config.ts` already enforces 80% globally — this skill works with whatever threshold you pass, independently of the config.

### 2. Run the coverage report

```bash
npm run test:unit:coverage 2>&1 | tee /tmp/coverage-run-1.txt || true
```

> Use `|| true` so a coverage-threshold failure doesn't abort the skill — you still need the output.

Parse the **text reporter** table from stdout. The format produced by `@vitest/coverage-v8` looks like:

```
 % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
---------|----------|---------|---------|-------------------
  All files |      82.5 |       75 |      90 |      82.5 |
  src/utils |         … |        … |       … |         … |
   string.ts |        60 |       50 |      66 |        60 | 14-22,35
```

Extract every **file row** (non-header, non-summary lines). For each file capture:
- Relative path (e.g. `src/utils/string.ts`)
- Statement %, Branch %, Function %, Line %
- Uncovered line ranges (last column)

### 3. Identify files below threshold

Filter the parsed rows: keep files where **any** of the four metrics is below `<threshold>`.

If no files are below threshold: print a success message and stop.

### 4. Analyse each under-covered file

For each file below threshold:

1. **Read the source file** (path relative to project root, e.g. `src/utils/string.ts`).
2. **Read its existing test file** if one exists:
   - Convention: `tests/unit/<same-relative-path>.test.ts`
   - e.g. source `src/utils/string.ts` → test `tests/unit/utils/string.test.ts`
3. Identify the coverage gaps:
   - Functions/branches/lines that are untested
   - Use the uncovered line numbers from the coverage table to pinpoint exactly which code paths are missing
   - Look for: uncovered branches in `if`/`switch`/ternary, untested error paths, untested edge cases (empty input, null, boundary values)

### 5. Generate targeted tests

For each under-covered file, write or extend the corresponding test file:

- **File location**: `tests/unit/<module-path>.test.ts` (mirror the `src/` structure)
  - `src/utils/string.ts` → `tests/unit/utils/string.test.ts`
  - `src/services/payment.service.ts` → `tests/unit/services/payment.service.test.ts`
- **If the file already exists**: add new `describe` blocks or `it` cases — do not duplicate existing tests
- **If the file does not exist**: create it from scratch following the unit test template in `reference.md`

Focus on:
- The exact uncovered lines identified in step 4
- Branch coverage: every `if`/`else`, `switch` case, ternary arm, optional chain, nullish coalesce
- Error paths: functions that `throw`, reject, or return error states
- Edge cases: empty strings, zero, negative numbers, null/undefined inputs, empty arrays

Rules (from CLAUDE.md):
- Test behaviour, not implementation
- Assert specific values, not just truthiness
- Include both positive and negative test cases
- Include error message assertions for negative cases
- Every test must be independent — no shared state between tests
- Use `beforeEach` for setup only when it reduces repetition without coupling tests

### 6. Re-run coverage to verify improvement

```bash
npm run test:unit:coverage 2>&1 | tee /tmp/coverage-run-2.txt || true
```

Parse the new table with the same logic as step 2.

### 7. Produce a summary report

Print a markdown summary to the terminal:

```
## Coverage Analysis Report

**Threshold:** <threshold>%
**Date:** <today>

### Files improved

| File | Before (stmt/branch/fn/line) | After (stmt/branch/fn/line) | Status |
|------|-----------------------------|-----------------------------|--------|
| src/utils/string.ts | 60/50/66/60 | 88/85/100/88 | ✓ now passing |
| src/services/payment.service.ts | 72/68/75/72 | 95/90/100/95 | ✓ now passing |

### Still below threshold

| File | Current (stmt/branch/fn/line) | Gap |
|------|-------------------------------|-----|
| src/... | 70/65/80/70 | branch -15%, stmt -10% |

### Tests generated

- `tests/unit/utils/string.test.ts` — added 4 cases (branch, error paths)
- `tests/unit/services/payment.service.test.ts` — created (12 cases)

### Overall suite

- Tests before: <N> passing
- Tests after: <N+added> passing
- Regressions: none ✓  (or list any failures)
```

If any previously-passing tests now fail, fix the regressions before finishing — never leave a broken test suite.

---

## Hard rules

- **Never** delete or weaken existing tests to make coverage numbers look better
- **Never** write empty tests (`it('...', () => {})`) or tests that always pass without asserting anything
- **Always** fix test failures before returning — do not leave a red suite
- Coverage numbers must improve measurably for every file you touch; if a file cannot be improved (e.g. requires a running server), note why in the report
- File naming: `module-name.test.ts` (kebab-case), mirroring the `src/` directory structure under `tests/unit/`
