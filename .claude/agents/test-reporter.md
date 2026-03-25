---
name: test-reporter
description: Runs the full test suite across all test types, collects results,
  identifies flaky and slow tests, and generates a structured markdown report
  with coverage, timing, and improvement recommendations
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
model: sonnet
---

## Instructions

### 1. Run the full test suite

Run each test type independently and capture output:

```bash
# Unit tests with coverage (JSON reporter for machine-readable output)
npm run test:unit -- --reporter=json --outputFile=.test-reporter/unit-results.json 2>&1

# E2E tests — chromium only for speed, with JSON reporter
npx playwright test --project=chromium --reporter=json 2> .test-reporter/e2e-results.json

# API tests
npx playwright test tests/api --reporter=json 2> .test-reporter/api-results.json
```

Create `.test-reporter/` directory first if it does not exist.

### 2. Parse results

For each test suite, extract:
- Total tests, passed, failed, skipped
- Per-test duration
- Retry counts (a test that failed on first attempt but passed on retry = flaky)
- Error messages and stack traces for failures

### 3. Identify flaky tests

A test is flaky if:
- `retries > 0` AND final status is `passed`, OR
- The same test name appears in both passed and failed across multiple runs if re-running

Flag each flaky test with:
- Test name and file
- Number of retries needed
- The error message from the failed attempt(s)

### 4. Identify slow tests

Thresholds:
- Unit tests: > 5 000 ms = slow
- E2E tests: > 30 000 ms = slow
- API tests: > 10 000 ms = slow

Collect the top 10 slowest tests across all suites.

### 5. Collect coverage per module

Read the Vitest coverage output (JSON format at `coverage/coverage-final.json` if present, otherwise run `npm run test:unit -- --coverage`).

For each source file under `src/`, report:
- Statements %
- Branches %
- Functions %
- Lines %

Flag any file below 80% on any dimension.

### 6. Generate the markdown report

Write the report to `test-report.md` in the project root with the following structure:

---

# Test Report

**Generated:** <ISO timestamp>
**Branch:** <current git branch>
**Commit:** <short SHA — 7 chars>

---

## Summary

| Suite | Total | Passed | Failed | Skipped | Duration |
|-------|-------|--------|--------|---------|----------|
| Unit  |       |        |        |         |          |
| E2E   |       |        |        |         |          |
| API   |       |        |        |         |          |
| **Total** |  |        |        |         |          |

Overall status: ✅ PASS or ❌ FAIL

---

## Coverage per Module

| File | Statements | Branches | Functions | Lines | Status |
|------|-----------|----------|-----------|-------|--------|
| src/... | % | % | % | % | ✅/⚠️ |

---

## Top 10 Slowest Tests

| Rank | Test | Suite | Duration |
|------|------|-------|----------|

---

## Flaky Tests

| Test | Suite | Retries | Failure Pattern |
|------|-------|---------|----------------|

If none: "No flaky tests detected."

---

## Failures

For each failed test:
- **Test:** full test name
- **File:** path:line
- **Error:** first line of error message
- **Snippet:** relevant stack frame

---

## Recommendations

Based on the results, produce a bullet-point list covering:
- Tests that should be marked `.skip` with a TODO (genuinely broken, not flaky)
- Tests that need `{ retries: 2 }` added (confirmed flaky)
- Slow tests that could benefit from mocking or data reduction
- Modules with low coverage and suggested test additions
- Any patterns in failures that suggest a shared root cause (e.g. all auth tests failing → possible selector change)

---

### 7. Clean up

Remove `.test-reporter/` temp directory after the report is written.

### 8. Output

Print the path to the generated report and a one-paragraph executive summary to stdout.
