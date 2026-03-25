/**
 * Performance reporter — types, metric serialisation, and HTML report generation.
 *
 * Each test spec serialises its results to JSON files in playwright-report/.
 * generatePerfReport() reads those files and writes a Chart.js-powered HTML report.
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PageMetrics {
  pageName: string;
  url: string;
  ttfb: number;             // Time to First Byte (ms)
  fcp: number;              // First Contentful Paint (ms)
  lcp: number;              // Largest Contentful Paint (ms)
  cls: number;              // Cumulative Layout Shift (0–1 score)
  inp: number;              // Interaction to Next Paint (ms)
  domContentLoaded: number; // DOMContentLoaded event end (ms)
  loadComplete: number;     // load event end (ms)
  timestamp: string;
}

export interface ApiLoadMetrics {
  endpoint: string;
  method: string;
  concurrency: number;
  totalRequests: number;
  successCount: number;
  failureRate: number;
  p50: number;              // ms
  p95: number;              // ms
  p99: number;              // ms
  min: number;              // ms
  max: number;              // ms
  mean: number;             // ms
  timestamp: string;
}

export interface MemoryMetrics {
  endpoint: string;
  rssBefore: number;        // bytes
  rssAfter: number;         // bytes
  heapUsedBefore: number;   // bytes
  heapUsedAfter: number;    // bytes
  delta: number;            // bytes
  leaked: boolean;
  requestCount: number;
  p95Early: number;         // ms — avg p95 of first batch
  p95Late: number;          // ms — avg p95 of last batch
  degraded: boolean;
  timestamp: string;
}

// ── Thresholds ────────────────────────────────────────────────────────────────

export const PAGE_THRESHOLDS = {
  ttfb: 200,    // ms (Google "Good" threshold)
  fcp: 1_500,   // ms
  lcp: 2_500,   // ms
  cls: 0.1,     // score
  inp: 200,     // ms
} as const;

export const API_THRESHOLDS = {
  reads: { p95: 500, p99: 1_000 },
  writes: { p95: 2_000, p99: 3_000 },
} as const;

// ── Percentile math ───────────────────────────────────────────────────────────

export function computePercentiles(
  durations: number[],
): Pick<ApiLoadMetrics, 'p50' | 'p95' | 'p99' | 'min' | 'max' | 'mean'> {
  if (durations.length === 0) return { p50: 0, p95: 0, p99: 0, min: 0, max: 0, mean: 0 };
  const sorted = [...durations].sort((a, b) => a - b);
  const pct = (p: number) => sorted[Math.ceil((p / 100) * sorted.length) - 1] ?? 0;
  return {
    p50: Math.round(pct(50)),
    p95: Math.round(pct(95)),
    p99: Math.round(pct(99)),
    min: Math.round(sorted[0] ?? 0),
    max: Math.round(sorted[sorted.length - 1] ?? 0),
    mean: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
  };
}

// ── File I/O ──────────────────────────────────────────────────────────────────

const REPORT_DIR = 'playwright-report';
const PAGE_JSON = join(REPORT_DIR, 'perf-page-metrics.json');
const API_JSON = join(REPORT_DIR, 'perf-api-metrics.json');
const HTML_REPORT = join(REPORT_DIR, 'perf-report.html');

export function savePageMetrics(metrics: PageMetrics[]): void {
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(PAGE_JSON, JSON.stringify(metrics, null, 2), 'utf-8');
}

export function saveApiMetrics(apiMetrics: ApiLoadMetrics[], memMetrics: MemoryMetrics[]): void {
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(API_JSON, JSON.stringify({ api: apiMetrics, memory: memMetrics }, null, 2), 'utf-8');
}

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

// ── HTML generation ───────────────────────────────────────────────────────────

function pctColor(value: number, threshold: number): string {
  const ratio = value / threshold;
  if (ratio <= 1) return '#16a34a';      // green — pass
  if (ratio <= 1.25) return '#ca8a04';  // yellow — warning
  return '#dc2626';                      // red — fail
}

function clsColor(cls: number): string {
  if (cls <= 0.1) return '#16a34a';
  if (cls <= 0.25) return '#ca8a04';
  return '#dc2626';
}

function badge(pass: boolean): string {
  return pass
    ? '<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;">PASS</span>'
    : '<span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;">FAIL</span>';
}

function metricCell(value: number, threshold: number, unit = 'ms'): string {
  const pass = value > 0 && value <= threshold;
  const color = value > 0 ? pctColor(value, threshold) : '#6b7280';
  const label = value > 0 ? `${value}${unit}` : 'N/A';
  return `<td style="color:${color};font-weight:600;text-align:right;">${label} ${value > 0 ? badge(pass) : ''}</td>`;
}

function buildPageTable(metrics: PageMetrics[]): string {
  const { ttfb, fcp, lcp, cls, inp } = PAGE_THRESHOLDS;
  const rows = metrics
    .map(
      (m) => `<tr>
        <td><strong>${m.pageName}</strong><br/><span style="color:#6b7280;font-size:12px;">${m.url}</span></td>
        ${metricCell(m.ttfb, ttfb)}
        ${metricCell(m.fcp, fcp)}
        ${metricCell(m.lcp, lcp)}
        <td style="color:${clsColor(m.cls)};font-weight:600;text-align:right;">${m.cls.toFixed(4)} ${badge(m.cls <= cls)}</td>
        <td style="color:${m.inp > 0 ? pctColor(m.inp, inp) : '#6b7280'};font-weight:600;text-align:right;">${m.inp > 0 ? `${m.inp}ms` : 'N/A'}</td>
        <td style="text-align:right;color:#374151;">${m.domContentLoaded}ms</td>
        <td style="text-align:right;color:#374151;">${m.loadComplete}ms</td>
      </tr>`,
    )
    .join('');
  return `<table style="width:100%;border-collapse:collapse;font-size:14px;">
    <thead><tr style="background:#f9fafb;border-bottom:2px solid #e5e7eb;">
      <th style="padding:10px 12px;text-align:left;">Page</th>
      <th style="padding:10px 12px;text-align:right;">TTFB <span style="color:#6b7280;font-weight:400;">&lt;${ttfb}ms</span></th>
      <th style="padding:10px 12px;text-align:right;">FCP <span style="color:#6b7280;font-weight:400;">&lt;${fcp}ms</span></th>
      <th style="padding:10px 12px;text-align:right;">LCP <span style="color:#6b7280;font-weight:400;">&lt;${lcp}ms</span></th>
      <th style="padding:10px 12px;text-align:right;">CLS <span style="color:#6b7280;font-weight:400;">&lt;${cls}</span></th>
      <th style="padding:10px 12px;text-align:right;">INP <span style="color:#6b7280;font-weight:400;">&lt;${inp}ms</span></th>
      <th style="padding:10px 12px;text-align:right;">DCL</th>
      <th style="padding:10px 12px;text-align:right;">Load</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function buildApiTable(metrics: ApiLoadMetrics[]): string {
  const rows = metrics
    .map((m) => {
      const th = m.method === 'GET' ? API_THRESHOLDS.reads : API_THRESHOLDS.writes;
      const p95Pass = m.p95 <= th.p95;
      const p99Pass = m.p99 <= th.p99;
      return `<tr>
        <td><code style="background:#f3f4f6;padding:2px 6px;border-radius:4px;">${m.method}</code></td>
        <td><code style="font-size:13px;">${m.endpoint}</code></td>
        <td style="text-align:right;">${m.concurrency}</td>
        <td style="text-align:right;">${m.successCount}/${m.totalRequests}</td>
        <td style="text-align:right;color:${(m.failureRate * 100) > 5 ? '#dc2626' : '#16a34a'};">${(m.failureRate * 100).toFixed(1)}%</td>
        <td style="text-align:right;color:#374151;">${m.p50}ms</td>
        <td style="text-align:right;color:${pctColor(m.p95, th.p95)};font-weight:600;">${m.p95}ms ${badge(p95Pass)}</td>
        <td style="text-align:right;color:${pctColor(m.p99, th.p99)};font-weight:600;">${m.p99}ms ${badge(p99Pass)}</td>
        <td style="text-align:right;color:#6b7280;">${m.min}–${m.max}ms</td>
      </tr>`;
    })
    .join('');
  return `<table style="width:100%;border-collapse:collapse;font-size:14px;">
    <thead><tr style="background:#f9fafb;border-bottom:2px solid #e5e7eb;">
      <th style="padding:10px 12px;">Method</th>
      <th style="padding:10px 12px;">Endpoint</th>
      <th style="padding:10px 12px;text-align:right;">Concurrent</th>
      <th style="padding:10px 12px;text-align:right;">Success</th>
      <th style="padding:10px 12px;text-align:right;">Error%</th>
      <th style="padding:10px 12px;text-align:right;">p50</th>
      <th style="padding:10px 12px;text-align:right;">p95</th>
      <th style="padding:10px 12px;text-align:right;">p99</th>
      <th style="padding:10px 12px;text-align:right;">Range</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function buildMemTable(metrics: MemoryMetrics[]): string {
  if (metrics.length === 0) return '<p style="color:#6b7280;">No memory metrics recorded.</p>';
  const mb = (b: number) => `${(b / 1_048_576).toFixed(1)} MB`;
  const rows = metrics
    .map(
      (m) => `<tr>
        <td><code style="font-size:13px;">${m.endpoint}</code></td>
        <td style="text-align:right;">${m.requestCount}</td>
        <td style="text-align:right;">${mb(m.rssBefore)}</td>
        <td style="text-align:right;">${mb(m.rssAfter)}</td>
        <td style="text-align:right;color:${m.delta > 52_428_800 ? '#dc2626' : '#16a34a'};font-weight:600;">${mb(m.delta)}</td>
        <td style="text-align:right;">${m.p95Early}ms → ${m.p95Late}ms</td>
        <td style="text-align:right;">${m.degraded ? '<span style="color:#dc2626;font-weight:600;">⚠ Degraded</span>' : '<span style="color:#16a34a;">✓ Stable</span>'}</td>
        <td style="text-align:right;">${m.leaked ? badge(false) : badge(true)}</td>
      </tr>`,
    )
    .join('');
  return `<table style="width:100%;border-collapse:collapse;font-size:14px;">
    <thead><tr style="background:#f9fafb;border-bottom:2px solid #e5e7eb;">
      <th style="padding:10px 12px;">Endpoint</th>
      <th style="padding:10px 12px;text-align:right;">Requests</th>
      <th style="padding:10px 12px;text-align:right;">RSS Before</th>
      <th style="padding:10px 12px;text-align:right;">RSS After</th>
      <th style="padding:10px 12px;text-align:right;">RSS Δ</th>
      <th style="padding:10px 12px;text-align:right;">p95 Trend</th>
      <th style="padding:10px 12px;text-align:right;">Stability</th>
      <th style="padding:10px 12px;text-align:right;">Leak?</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function summaryCard(label: string, value: string | number, sub: string, color: string): string {
  return `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px 24px;min-width:140px;">
    <div style="font-size:13px;color:#6b7280;margin-bottom:4px;">${label}</div>
    <div style="font-size:28px;font-weight:700;color:${color};">${value}</div>
    <div style="font-size:12px;color:#9ca3af;margin-top:2px;">${sub}</div>
  </div>`;
}

// ── Main report generator ─────────────────────────────────────────────────────

export function generatePerfReport(): void {
  mkdirSync(REPORT_DIR, { recursive: true });

  const pageMetrics = readJson<PageMetrics[]>(PAGE_JSON, []);
  const { api: apiMetrics = [], memory: memMetrics = [] } = readJson<{
    api: ApiLoadMetrics[];
    memory: MemoryMetrics[];
  }>(API_JSON, { api: [], memory: [] });

  const now = new Date().toISOString();

  // ── Summary counts ────────────────────────────────────────────────────────
  const pagePasses = pageMetrics.filter(
    (m) =>
      m.ttfb <= PAGE_THRESHOLDS.ttfb &&
      m.fcp <= PAGE_THRESHOLDS.fcp &&
      (m.lcp === 0 || m.lcp <= PAGE_THRESHOLDS.lcp) &&
      m.cls <= PAGE_THRESHOLDS.cls,
  ).length;

  const apiP95Passes = apiMetrics.filter((m) => {
    const th = m.method === 'GET' ? API_THRESHOLDS.reads : API_THRESHOLDS.writes;
    return m.p95 <= th.p95;
  }).length;

  // ── Chart data ────────────────────────────────────────────────────────────
  const pageLabels = JSON.stringify(pageMetrics.map((m) => m.pageName));
  const ttfbData = JSON.stringify(pageMetrics.map((m) => m.ttfb));
  const fcpData = JSON.stringify(pageMetrics.map((m) => m.fcp));
  const lcpData = JSON.stringify(pageMetrics.map((m) => m.lcp));
  const clsData = JSON.stringify(pageMetrics.map((m) => m.cls));
  const inpData = JSON.stringify(pageMetrics.map((m) => m.inp));
  const n = pageMetrics.length;
  const ttfbThreshLine = JSON.stringify(Array(n).fill(PAGE_THRESHOLDS.ttfb));
  const fcpThreshLine = JSON.stringify(Array(n).fill(PAGE_THRESHOLDS.fcp));
  const lcpThreshLine = JSON.stringify(Array(n).fill(PAGE_THRESHOLDS.lcp));
  const clsThreshLine = JSON.stringify(Array(n).fill(PAGE_THRESHOLDS.cls));
  const inpThreshLine = JSON.stringify(Array(n).fill(PAGE_THRESHOLDS.inp));

  const apiLabels = JSON.stringify(apiMetrics.map((m) => `${m.method} ${m.endpoint.split('/').pop()}`));
  const p50Data = JSON.stringify(apiMetrics.map((m) => m.p50));
  const p95Data = JSON.stringify(apiMetrics.map((m) => m.p95));
  const p99Data = JSON.stringify(apiMetrics.map((m) => m.p99));
  const errorData = JSON.stringify(apiMetrics.map((m) => parseFloat((m.failureRate * 100).toFixed(1))));

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Performance Report — ${now.slice(0, 10)}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; color: #1e293b; line-height: 1.6; }
    header { background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color: #fff; padding: 32px 40px; }
    header h1 { font-size: 28px; font-weight: 700; letter-spacing: -0.5px; }
    header p { color: #94a3b8; font-size: 14px; margin-top: 6px; }
    .cards { display: flex; gap: 16px; flex-wrap: wrap; margin: 28px 40px 0; }
    main { padding: 24px 40px 48px; }
    section { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 28px; margin-bottom: 28px; }
    section h2 { font-size: 20px; font-weight: 700; color: #0f172a; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid #f1f5f9; }
    section h3 { font-size: 15px; font-weight: 600; color: #374151; margin: 24px 0 12px; }
    .chart-wrap { position: relative; height: 320px; margin-top: 24px; }
    table td, table th { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    table tr:last-child td { border-bottom: none; }
    table tr:hover td { background: #f8fafc; }
    .threshold-note { font-size: 12px; color: #6b7280; margin-top: 12px; }
    .legend { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 8px; font-size: 12px; }
    .legend-item { display: flex; align-items: center; gap: 4px; }
    .legend-dot { width: 10px; height: 10px; border-radius: 50%; }
  </style>
</head>
<body>
<header>
  <h1>⚡ Performance Report</h1>
  <p>Generated: ${now} &nbsp;|&nbsp; Base URL: https://automationexercise.com &nbsp;|&nbsp; Browser: Chromium</p>
</header>

<div class="cards">
  ${summaryCard('Pages Tested', pageMetrics.length, 'page load measurements', '#0f172a')}
  ${summaryCard('Pages Passing', pagePasses, `of ${pageMetrics.length} meet all thresholds`, pagePasses === pageMetrics.length ? '#16a34a' : '#dc2626')}
  ${summaryCard('API Endpoints', apiMetrics.length, 'load tested at 50 concurrent', '#0f172a')}
  ${summaryCard('API p95 Passing', apiP95Passes, `of ${apiMetrics.length} meet p95 threshold`, apiP95Passes === apiMetrics.length ? '#16a34a' : '#dc2626')}
  ${summaryCard('Memory Leaks', memMetrics.filter((m) => m.leaked).length, 'endpoints flagged', memMetrics.filter((m) => m.leaked).length === 0 ? '#16a34a' : '#dc2626')}
</div>

<main>
  <!-- ── Section 1: Page Performance ─────────────────────────────────────── -->
  <section>
    <h2>📄 Page Load Performance — Core Web Vitals</h2>
    <div class="legend">
      <div class="legend-item"><div class="legend-dot" style="background:#16a34a;"></div> Pass (≤ threshold)</div>
      <div class="legend-item"><div class="legend-dot" style="background:#ca8a04;"></div> Warning (≤ 125% of threshold)</div>
      <div class="legend-item"><div class="legend-dot" style="background:#dc2626;"></div> Fail (&gt; 125% of threshold)</div>
    </div>
    <h3>Metrics Table</h3>
    ${pageMetrics.length > 0 ? buildPageTable(pageMetrics) : '<p style="color:#6b7280;">No page metrics recorded yet.</p>'}

    <h3>Core Web Vitals — TTFB / FCP / LCP</h3>
    <div class="chart-wrap">
      <canvas id="vitalsChart"></canvas>
    </div>
    <p class="threshold-note">Dashed lines represent Google "Good" thresholds: TTFB &lt;200ms · FCP &lt;1.5s · LCP &lt;2.5s</p>

    <h3>Layout Stability &amp; Interactivity — CLS / INP</h3>
    <div class="chart-wrap">
      <canvas id="clsInpChart"></canvas>
    </div>
    <p class="threshold-note">Dashed lines represent Google "Good" thresholds: CLS &lt;0.1 · INP &lt;200ms</p>
  </section>

  <!-- ── Section 2: API Performance ──────────────────────────────────────── -->
  <section>
    <h2>🚀 API Load Performance — 50 Concurrent Requests</h2>
    <h3>Response Time Percentiles</h3>
    ${apiMetrics.length > 0 ? buildApiTable(apiMetrics) : '<p style="color:#6b7280;">No API metrics recorded yet.</p>'}

    <h3>p50 / p95 / p99 Response Times</h3>
    <div class="chart-wrap">
      <canvas id="apiChart"></canvas>
    </div>
    <p class="threshold-note">Thresholds: Read p95 &lt;500ms · Write p95 &lt;2000ms · Read p99 &lt;1000ms · Write p99 &lt;3000ms</p>

    <h3>Error Rate by Endpoint</h3>
    <div class="chart-wrap" style="height:200px;">
      <canvas id="errorChart"></canvas>
    </div>
  </section>

  <!-- ── Section 3: Memory Analysis ──────────────────────────────────────── -->
  <section>
    <h2>🧠 Memory Analysis — Leak Detection</h2>
    ${buildMemTable(memMetrics)}
    <p class="threshold-note" style="margin-top:16px;">
      RSS Δ &gt;50 MB after repeated requests is flagged as a potential leak.
      Response time degradation &gt;50% from early to late batches is flagged as "Degraded".
    </p>
  </section>
</main>

<script>
(function () {
  const FONT = { family: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', size: 12 };
  Chart.defaults.font = FONT;

  // ── Core Web Vitals chart ────────────────────────────────────────────────
  new Chart(document.getElementById('vitalsChart'), {
    data: {
      labels: ${pageLabels},
      datasets: [
        { type: 'bar',  label: 'TTFB (ms)', data: ${ttfbData}, backgroundColor: '#3b82f6', borderRadius: 4 },
        { type: 'bar',  label: 'FCP (ms)',  data: ${fcpData},  backgroundColor: '#8b5cf6', borderRadius: 4 },
        { type: 'bar',  label: 'LCP (ms)',  data: ${lcpData},  backgroundColor: '#06b6d4', borderRadius: 4 },
        { type: 'line', label: 'TTFB threshold (200ms)',  data: ${ttfbThreshLine}, borderColor: '#3b82f6', borderDash: [6,4], borderWidth: 2, pointRadius: 0, fill: false },
        { type: 'line', label: 'FCP threshold (1500ms)',  data: ${fcpThreshLine}, borderColor: '#8b5cf6', borderDash: [6,4], borderWidth: 2, pointRadius: 0, fill: false },
        { type: 'line', label: 'LCP threshold (2500ms)',  data: ${lcpThreshLine}, borderColor: '#06b6d4', borderDash: [6,4], borderWidth: 2, pointRadius: 0, fill: false },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: { y: { beginAtZero: true, title: { display: true, text: 'Time (ms)' } } },
      plugins: { legend: { position: 'bottom', labels: { padding: 16 } } },
    },
  });

  // ── CLS / INP chart ──────────────────────────────────────────────────────
  new Chart(document.getElementById('clsInpChart'), {
    data: {
      labels: ${pageLabels},
      datasets: [
        { type: 'bar',  label: 'CLS (score)',  data: ${clsData},  backgroundColor: '#f59e0b', borderRadius: 4, yAxisID: 'yCls' },
        { type: 'bar',  label: 'INP (ms)',     data: ${inpData},  backgroundColor: '#ec4899', borderRadius: 4, yAxisID: 'yInp' },
        { type: 'line', label: 'CLS threshold (0.1)',  data: ${clsThreshLine}, borderColor: '#f59e0b', borderDash: [6,4], borderWidth: 2, pointRadius: 0, fill: false, yAxisID: 'yCls' },
        { type: 'line', label: 'INP threshold (200ms)', data: ${inpThreshLine}, borderColor: '#ec4899', borderDash: [6,4], borderWidth: 2, pointRadius: 0, fill: false, yAxisID: 'yInp' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        yCls: { type: 'linear', position: 'left',  beginAtZero: true, title: { display: true, text: 'CLS Score' } },
        yInp: { type: 'linear', position: 'right', beginAtZero: true, title: { display: true, text: 'INP (ms)' }, grid: { drawOnChartArea: false } },
      },
      plugins: { legend: { position: 'bottom', labels: { padding: 16 } } },
    },
  });

  // ── API response times chart ─────────────────────────────────────────────
  new Chart(document.getElementById('apiChart'), {
    type: 'bar',
    data: {
      labels: ${apiLabels},
      datasets: [
        { label: 'p50 (ms)', data: ${p50Data}, backgroundColor: '#22c55e', borderRadius: 4 },
        { label: 'p95 (ms)', data: ${p95Data}, backgroundColor: '#f59e0b', borderRadius: 4 },
        { label: 'p99 (ms)', data: ${p99Data}, backgroundColor: '#ef4444', borderRadius: 4 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: { y: { beginAtZero: true, title: { display: true, text: 'Response Time (ms)' } } },
      plugins: { legend: { position: 'bottom', labels: { padding: 16 } } },
    },
  });

  // ── Error rate chart ─────────────────────────────────────────────────────
  new Chart(document.getElementById('errorChart'), {
    type: 'bar',
    data: {
      labels: ${apiLabels},
      datasets: [{
        label: 'Error rate (%)',
        data: ${errorData},
        backgroundColor: ${errorData}.map(v => v > 5 ? '#ef4444' : v > 1 ? '#f59e0b' : '#22c55e'),
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { beginAtZero: true, max: 100, title: { display: true, text: 'Error Rate (%)' } } },
      plugins: { legend: { display: false } },
    },
  });
})();
</script>
</body>
</html>`;

  writeFileSync(HTML_REPORT, html, 'utf-8');
}
