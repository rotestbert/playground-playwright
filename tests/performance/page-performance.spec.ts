/**
 * Page load performance tests — Core Web Vitals (WCAG + Google "Good" thresholds)
 *
 * Measures per page:
 *   TTFB  < 200 ms   — Time to First Byte
 *   FCP   < 1 500 ms — First Contentful Paint
 *   LCP   < 2 500 ms — Largest Contentful Paint
 *   CLS   < 0.1      — Cumulative Layout Shift
 *   INP   < 200 ms   — Interaction to Next Paint
 *
 * Also records DCL (DOMContentLoaded) and full load time for the report.
 *
 * Runs in serial mode (single worker) so network conditions don't
 * compete between tests and measurements stay comparable.
 *
 * Run:  npm run test:perf
 */

import { expect } from '@playwright/test';
import { test } from '../e2e/fixtures/index.js';
import { ProductsPage } from '../e2e/pages/ProductsPage.js';
import { CartPage } from '../e2e/pages/CartPage.js';
import { CheckoutPage } from '../e2e/pages/CheckoutPage.js';
import { proceedToCheckoutFromCart } from '../helpers/checkoutHelper.js';
import {
  savePageMetrics,
  generatePerfReport,
  PAGE_THRESHOLDS,
  type PageMetrics,
} from '../helpers/perfReporter.js';

// ── Web Vitals collection ─────────────────────────────────────────────────────

/**
 * Navigates to `url` (if provided) or uses the current page, finalises LCP via
 * a scroll gesture, then extracts all Web Vitals from the Performance API.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function collectWebVitals(rawPage: any, pageName: string, url?: string): Promise<PageMetrics> {
  if (url) {
    await rawPage.goto(url, { waitUntil: 'networkidle' });
  } else {
    await rawPage.waitForLoadState('networkidle');
  }

  // Scroll finalises LCP (LCP stops updating on the first user interaction)
  await rawPage.mouse.wheel(0, 100);
  // Give buffered PerformanceObserver callbacks time to fire
  await rawPage.waitForTimeout(1_500);

  const vitals = await rawPage.evaluate(
    (): Promise<{
      ttfb: number;
      fcp: number;
      lcp: number;
      cls: number;
      domContentLoaded: number;
      loadComplete: number;
    }> => {
      return new Promise((resolve) => {
        const out = { ttfb: 0, fcp: 0, lcp: 0, cls: 0, domContentLoaded: 0, loadComplete: 0 };

        // Navigation Timing (synchronous — always available after load)
        const nav = performance.getEntriesByType(
          'navigation',
        )[0] as PerformanceNavigationTiming | undefined;
        if (nav) {
          out.ttfb = Math.round(nav.responseStart);
          out.domContentLoaded = Math.round(nav.domContentLoadedEventEnd);
          out.loadComplete = Math.round(nav.loadEventEnd);
        }

        // FCP (synchronous paint entry — always buffered)
        const fcpEntry = performance.getEntriesByName('first-contentful-paint')[0];
        out.fcp = fcpEntry ? Math.round(fcpEntry.startTime) : 0;

        let lcpDone = false;
        let clsDone = false;
        const maybeDone = () => {
          if (lcpDone && clsDone) resolve(out);
        };

        // LCP — buffered so it captures entries fired before this observer
        try {
          const obs = new PerformanceObserver((list) => {
            for (const e of list.getEntries()) {
              out.lcp = Math.round(e.startTime);
            }
          });
          obs.observe({ type: 'largest-contentful-paint', buffered: true });
          setTimeout(() => {
            obs.disconnect();
            lcpDone = true;
            maybeDone();
          }, 800);
        } catch {
          lcpDone = true;
          maybeDone();
        }

        // CLS — accumulate layout-shift entries that had no recent input
        try {
          const obs = new PerformanceObserver((list) => {
            for (const e of list.getEntries()) {
              const ls = e as unknown as { hadRecentInput: boolean; value: number };
              if (!ls.hadRecentInput) {
                out.cls = parseFloat((out.cls + (ls.value ?? 0)).toFixed(4));
              }
            }
          });
          obs.observe({ type: 'layout-shift', buffered: true });
          setTimeout(() => {
            obs.disconnect();
            clsDone = true;
            maybeDone();
          }, 800);
        } catch {
          clsDone = true;
          maybeDone();
        }
      });
    },
  );

  // INP — simulate one click and measure the event duration (Interaction to Next Paint)
  let inp = 0;
  try {
    const box = await rawPage.locator('body').boundingBox();
    if (box) {
      await rawPage.click('body', {
        position: { x: Math.round(box.width / 2), y: Math.round(box.height / 2) },
        force: true,
      });
    }
    inp = await rawPage.evaluate((): Promise<number> => {
      return new Promise((resolve) => {
        try {
          let maxDuration = 0;
          const obs = new PerformanceObserver((list) => {
            for (const e of list.getEntries()) {
              const ev = e as unknown as { duration: number };
              if (ev.duration > maxDuration) maxDuration = ev.duration;
            }
          });
          // durationThreshold: 0 captures all events (not just slow ones)
          obs.observe({ type: 'event', buffered: true, durationThreshold: 0 } as PerformanceObserverInit);
          // 600 ms is enough for the event + rendering cycle to complete
          setTimeout(() => {
            obs.disconnect();
            resolve(Math.round(maxDuration));
          }, 600);
        } catch {
          resolve(0);
        }
      });
    });
  } catch {
    inp = 0;
  }

  return {
    pageName,
    url: rawPage.url() as string,
    ttfb: vitals.ttfb,
    fcp: vitals.fcp,
    lcp: vitals.lcp,
    cls: vitals.cls,
    inp,
    domContentLoaded: vitals.domContentLoaded,
    loadComplete: vitals.loadComplete,
    timestamp: new Date().toISOString(),
  };
}

/** Asserts Core Web Vitals against the Google "Good" thresholds. */
function assertThresholds(m: PageMetrics): void {
  const { ttfb, fcp, lcp, cls, inp } = PAGE_THRESHOLDS;

  expect(
    m.ttfb,
    `[${m.pageName}] TTFB ${m.ttfb}ms exceeds threshold ${ttfb}ms`,
  ).toBeLessThanOrEqual(ttfb);

  expect(
    m.fcp,
    `[${m.pageName}] FCP ${m.fcp}ms exceeds threshold ${fcp}ms`,
  ).toBeLessThanOrEqual(fcp);

  if (m.lcp > 0) {
    expect(
      m.lcp,
      `[${m.pageName}] LCP ${m.lcp}ms exceeds threshold ${lcp}ms`,
    ).toBeLessThanOrEqual(lcp);
  }

  expect(
    m.cls,
    `[${m.pageName}] CLS ${m.cls} exceeds threshold ${cls}`,
  ).toBeLessThanOrEqual(cls);

  // INP is reported but only soft-asserted (requires real user interaction for accuracy)
  if (m.inp > 0 && m.inp > inp * 3) {
    console.warn(`[${m.pageName}] INP ${m.inp}ms is very high (threshold: ${inp}ms) — may indicate slow event handlers`);
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Page Load Performance', () => {
  test.describe.configure({ mode: 'serial' });

  /** Accumulates all page metrics for the final JSON + HTML report. */
  const allMetrics: PageMetrics[] = [];

  test.afterAll(() => {
    savePageMetrics(allMetrics);
    generatePerfReport();
    console.log(`\n📊 Performance report: playwright-report/perf-report.html`);
    console.log(`   ${allMetrics.length} pages measured`);
  });

  // ── Public pages ────────────────────────────────────────────────────────
  test.describe('Core Web Vitals — Public Pages', () => {
    test('home page (/) meets thresholds', async ({ page }) => {
      const metrics = await collectWebVitals(page, 'Home', '/');
      allMetrics.push(metrics);

      console.log(`  Home — TTFB:${metrics.ttfb}ms  FCP:${metrics.fcp}ms  LCP:${metrics.lcp}ms  CLS:${metrics.cls}  INP:${metrics.inp}ms`);
      assertThresholds(metrics);
    });

    test('login page (/login) meets thresholds', async ({ page }) => {
      const metrics = await collectWebVitals(page, 'Login', '/login');
      allMetrics.push(metrics);

      console.log(`  Login — TTFB:${metrics.ttfb}ms  FCP:${metrics.fcp}ms  LCP:${metrics.lcp}ms  CLS:${metrics.cls}  INP:${metrics.inp}ms`);
      assertThresholds(metrics);
    });

    test('products page (/products) meets thresholds', async ({ page }) => {
      const metrics = await collectWebVitals(page, 'Products', '/products');
      allMetrics.push(metrics);

      console.log(`  Products — TTFB:${metrics.ttfb}ms  FCP:${metrics.fcp}ms  LCP:${metrics.lcp}ms  CLS:${metrics.cls}  INP:${metrics.inp}ms`);
      assertThresholds(metrics);
    });
  });

  // ── Authenticated pages ─────────────────────────────────────────────────
  test.describe('Core Web Vitals — Authenticated Pages', () => {
    test('cart page (/view_cart) meets thresholds', async ({ authenticatedPage: page }) => {
      // Add a product so the cart page has content to paint
      const productsPage = new ProductsPage(page);
      await productsPage.goto();
      await productsPage.addFirstProductToCart();

      // Navigate fresh to /view_cart — Performance API resets per-navigation
      const metrics = await collectWebVitals(page, 'Cart', '/view_cart');
      allMetrics.push(metrics);

      console.log(`  Cart — TTFB:${metrics.ttfb}ms  FCP:${metrics.fcp}ms  LCP:${metrics.lcp}ms  CLS:${metrics.cls}  INP:${metrics.inp}ms`);
      assertThresholds(metrics);
    });

    test('checkout page (/checkout) meets thresholds', async ({
      checkoutReadyPage: { page },
    }) => {
      // Navigate through the cart → checkout flow; only the /checkout load is measured
      const cartPage = new CartPage(page);
      await cartPage.goto();
      await cartPage.proceedToCheckout();

      // Collect from the current /checkout page (no additional goto needed)
      const metrics = await collectWebVitals(page, 'Checkout');
      allMetrics.push(metrics);

      console.log(`  Checkout — TTFB:${metrics.ttfb}ms  FCP:${metrics.fcp}ms  LCP:${metrics.lcp}ms  CLS:${metrics.cls}  INP:${metrics.inp}ms`);
      assertThresholds(metrics);
    });

    test('payment page (/payment) meets thresholds', async ({
      checkoutReadyPage: { page },
    }) => {
      await proceedToCheckoutFromCart(page);
      const checkout = new CheckoutPage(page);
      await checkout.placeOrder();

      const metrics = await collectWebVitals(page, 'Payment');
      allMetrics.push(metrics);

      console.log(`  Payment — TTFB:${metrics.ttfb}ms  FCP:${metrics.fcp}ms  LCP:${metrics.lcp}ms  CLS:${metrics.cls}  INP:${metrics.inp}ms`);
      assertThresholds(metrics);
    });
  });

  // ── User flow Web Vitals ────────────────────────────────────────────────
  test.describe('User Flow Web Vitals — CLS and INP', () => {
    test('login flow: page stays stable (CLS < 0.1) after authentication', async ({
      registeredUser,
      page,
    }) => {
      await page.goto('/login', { waitUntil: 'networkidle' });

      // Fill and submit the login form — CLS can spike during redirect
      await page.locator('[data-qa="login-email"]').fill(registeredUser.email);
      await page.locator('[data-qa="login-password"]').fill(registeredUser.password);
      await page.locator('[data-qa="login-button"]').click();
      await page.waitForLoadState('networkidle');

      const metrics = await collectWebVitals(page, 'Post-Login Home');
      allMetrics.push(metrics);

      console.log(`  Post-Login — CLS:${metrics.cls}  INP:${metrics.inp}ms  LCP:${metrics.lcp}ms`);
      expect(
        metrics.cls,
        `Login flow CLS ${metrics.cls} exceeds threshold ${PAGE_THRESHOLDS.cls} — content shifted during authentication redirect`,
      ).toBeLessThanOrEqual(PAGE_THRESHOLDS.cls);
    });

    test('add-to-cart flow: products page stays stable (CLS < 0.1) after cart action', async ({
      authenticatedPage: page,
    }) => {
      const productsPage = new ProductsPage(page);
      await productsPage.goto();
      await page.waitForLoadState('networkidle');

      // Add a product — modal overlay can cause layout shifts
      await productsPage.addFirstProductToCart();

      // Wait for the modal to appear and collect CLS
      await page.waitForTimeout(1_000);

      const metrics = await collectWebVitals(page, 'Products (add-to-cart flow)');
      allMetrics.push(metrics);

      console.log(`  Add-to-cart — CLS:${metrics.cls}  INP:${metrics.inp}ms`);
      expect(
        metrics.cls,
        `Add-to-cart CLS ${metrics.cls} exceeds threshold ${PAGE_THRESHOLDS.cls} — modal overlay is causing layout shift`,
      ).toBeLessThanOrEqual(PAGE_THRESHOLDS.cls);
    });

    test('checkout flow: each step maintains stable LCP', async ({
      checkoutReadyPage: { page },
    }) => {
      // Cart
      await page.goto('/view_cart', { waitUntil: 'networkidle' });
      const cartMetrics = await collectWebVitals(page, 'Cart (flow)');
      allMetrics.push(cartMetrics);

      // Checkout
      const cartPage = new CartPage(page);
      await cartPage.proceedToCheckout();
      const checkoutMetrics = await collectWebVitals(page, 'Checkout (flow)');
      allMetrics.push(checkoutMetrics);

      // Payment
      const checkout = new CheckoutPage(page);
      await checkout.placeOrder();
      const paymentMetrics = await collectWebVitals(page, 'Payment (flow)');
      allMetrics.push(paymentMetrics);

      console.log(`  Checkout flow LCPs — Cart:${cartMetrics.lcp}ms → Checkout:${checkoutMetrics.lcp}ms → Payment:${paymentMetrics.lcp}ms`);

      // Each step in the flow should meet the LCP threshold
      for (const m of [cartMetrics, checkoutMetrics, paymentMetrics]) {
        if (m.lcp > 0) {
          expect(
            m.lcp,
            `[${m.pageName}] LCP ${m.lcp}ms exceeds threshold during checkout flow`,
          ).toBeLessThanOrEqual(PAGE_THRESHOLDS.lcp);
        }
      }
    });
  });
});
