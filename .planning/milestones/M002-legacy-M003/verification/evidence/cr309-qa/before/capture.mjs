import fs from "node:fs";
import { chromium } from "../../../../../../../frontend/node_modules/@playwright/test/index.mjs";

const origin = "http://127.0.0.1:3014";
const here = new URL("./", import.meta.url);
const results = {
  purpose: "CR-309 read-only before baseline; visual/functional comparison only.",
  formal_verification: false,
  state_change: false,
  real_provider_calls: 0,
  backend_mutations: 0,
  viewports: {},
  page_errors: [],
  blocked_analytics: [],
  unexpected_mutations: [],
};

const fixture = {
  modelId: "01a12f98-eac2-7448-8fa2-71224c837ffc",
  entries: ["garden", "learn"],
  passage: "Neighbors learn in the garden.",
  targets: [
    {
      entry: "garden",
      entry_meaning: "居民共同照料的花园",
      hint_phrase: "the garden",
      hint_blanks: [{ start: 4, end: 10 }],
      occurrences: [{ surface: "garden", start: 23, end: 29 }],
    },
    {
      entry: "learn",
      entry_meaning: "通过练习获得知识或技能",
      hint_phrase: "learn together",
      hint_blanks: [{ start: 0, end: 5 }],
      occurrences: [{ surface: "learn", start: 10, end: 15 }],
    },
  ],
};

async function ready(page) {
  await page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true",
  );
}

async function select(page, label, value) {
  const control = page.getByRole("combobox", { name: label });
  const native = control.locator("..").locator("select");
  const text = (await native.locator(`option[value="${value}"]`).textContent()).trim();
  await control.click();
  await page
    .locator(`[id="${await control.getAttribute("aria-controls")}"]`)
    .getByRole("option", { name: text, exact: true })
    .click();
}

async function options(page) {
  return page.evaluate(async () => {
    const response = await fetch("/api/v1/generation-options");
    return (await response.json()).data;
  });
}

async function computed(page, selector) {
  return page.locator(selector).first().evaluate((element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    const keys = [
      "display",
      "gridTemplateColumns",
      "gap",
      "rowGap",
      "columnGap",
      "marginTop",
      "marginBottom",
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "borderTopWidth",
      "borderRightWidth",
      "borderBottomWidth",
      "borderLeftWidth",
      "borderTopColor",
      "borderRadius",
      "backgroundColor",
      "fontFamily",
      "fontSize",
      "fontWeight",
      "lineHeight",
      "color",
      "overflowWrap",
    ];
    return {
      tag: element.tagName.toLowerCase(),
      className: element.className,
      box: {
        x: Math.round(box.x * 100) / 100,
        y: Math.round(box.y * 100) / 100,
        width: Math.round(box.width * 100) / 100,
        height: Math.round(box.height * 100) / 100,
      },
      style: Object.fromEntries(keys.map((key) => [key, style[key]])),
    };
  });
}

async function run(browser, name, viewport) {
  const context = await browser.newContext({ viewport, locale: "zh-CN" });
  await context.route("**/api/v1/analytics/events", async (route) => {
    results.blocked_analytics.push({ viewport: name, method: route.request().method() });
    await route.abort("blockedbyclient");
  });
  await context.addCookies([
    {
      name: "wordweave_ui_locale",
      value: "zh-CN",
      url: origin,
    },
  ]);
  await context.addInitScript(({ payload }) => {
    const original = window.fetch.bind(window);
    const sse = (event, data) =>
      `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    window.__cr309InterceptedStreams = 0;
    window.__cr309ReleaseFinal = null;
    window.fetch = async (input, init) => {
      const request = input instanceof Request ? input : null;
      const url = new URL(request?.url ?? String(input), location.href);
      const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
      if (
        method === "POST" &&
        url.pathname === "/api/v1/generations/stream"
      ) {
        window.__cr309InterceptedStreams += 1;
        const encoder = new TextEncoder();
        const frames = [
          [
            "generation.started",
            {
              seq: 1,
              contract_version: "m003-stream-v5",
              stream_id: "cr309-before-stream",
              run_id: "cr309-before-run",
              generation_token: "cr309-intercepted-token",
              snapshot: {
                configuration_revision: "cr309-before",
                effective_plan: { code: "visitor", origin: "visitor" },
                content_service: {
                  native_validation: true,
                  content_review_enabled: false,
                  content_repair_limit: 0,
                },
                native_correction_policy: {
                  version: "m003-native-policy-v1",
                  scope: "logical_request",
                  max_calls: 2,
                  editable: false,
                },
              },
            },
          ],
          ["generation.progress", { seq: 2, phase: "planning" }],
          [
            "generation.plan_item",
            {
              seq: 3,
              plan_id: "cr309-plan",
              meaning_language: "zh",
              item: { kind: "scene", text: "邻居在社区花园一起练习新技能。" },
            },
          ],
          [
            "generation.plan_item",
            {
              seq: 4,
              plan_id: "cr309-plan",
              meaning_language: "zh",
              item: {
                kind: "word_use",
                entry: "garden",
                form: "garden",
                sense: "居民共同照料的花园",
                phrase: "the garden",
              },
            },
          ],
          [
            "generation.plan_item",
            {
              seq: 5,
              plan_id: "cr309-plan",
              meaning_language: "zh",
              item: {
                kind: "word_use",
                entry: "learn",
                form: "learn",
                sense: "通过练习获得知识或技能",
                phrase: "learn together",
              },
            },
          ],
          ["generation.progress", { seq: 6, phase: "composing" }],
          [
            "generation.edit",
            {
              seq: 7,
              draft_id: "cr309-draft",
              content_version: 1,
              base_rev: 0,
              rev: 1,
              at: 0,
              delete_count: 0,
              insert: payload.passage,
              source: "provider",
            },
          ],
        ];
        const stream = new ReadableStream({
          start(controller) {
            frames.forEach(([event, data], index) => {
              setTimeout(
                () => controller.enqueue(encoder.encode(sse(event, data))),
                index * 90,
              );
            });
            window.__cr309ReleaseFinal = () => {
              controller.enqueue(
                encoder.encode(
                  sse("generation.progress", { seq: 8, phase: "finalizing" }),
                ),
              );
              controller.enqueue(
                encoder.encode(
                  sse("generation.validated", {
                    seq: 9,
                    run_id: "cr309-before-run",
                    final_content_version: 1,
                    result: {
                      passage: payload.passage,
                      tags: ["社区", "学习"],
                      targets: payload.targets,
                    },
                    content_outcome: "basic",
                    completion_notice: null,
                  }),
                ),
              );
              controller.close();
              window.__cr309ReleaseFinal = null;
            };
          },
        });
        return new Response(stream, {
          status: 200,
          headers: {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      }
      return original(input, init);
    };
  }, { payload: fixture });

  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (error) => results.page_errors.push(`${name}: ${error.message}`));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      request.method() !== "GET" &&
      url.pathname.startsWith("/api/v1/") &&
      url.pathname !== "/api/v1/analytics/events"
    )
      results.unexpected_mutations.push({
        viewport: name,
        method: request.method(),
        path: url.pathname,
      });
  });

  await page.goto(origin + "/create");
  await ready(page);
  const generationOptionsBefore = await options(page);
  const settings = page.locator("details.settings");
  if (!(await settings.evaluate((node) => node.open)))
    await settings.locator("summary").click();
  await select(page, "AI 模型", fixture.modelId);
  await select(page, "场景", "story");
  await select(page, "长度", "short");
  await select(page, "释义语言", "zh");
  const search = page.locator("#create-words-search");
  for (const entry of fixture.entries) {
    await search.fill(entry);
    await page.getByRole("option", { name: entry, exact: true }).click();
  }
  await page.screenshot({ path: new URL(`pre-${name}.png`, here).pathname, fullPage: true });

  await page.getByRole("button", { name: "开始生成", exact: true }).click();
  await page.locator(".m003-plan-use").nth(1).waitFor({ state: "visible" });
  await page.locator(".m003-live-draft").waitFor({ state: "visible" });
  const during = {
    planGrid: await computed(page, ".m003-plan-uses"),
    planCard: await computed(page, ".m003-plan-use"),
    word: await computed(page, ".m003-plan-use strong"),
    meaning: await computed(page, ".m003-plan-use span"),
    phrase: await computed(page, ".m003-plan-use small"),
    draft: await computed(page, ".m003-live-draft .story-text"),
  };
  await page.screenshot({ path: new URL(`during-${name}.png`, here).pathname, fullPage: true });

  await page.evaluate(() => window.__cr309ReleaseFinal?.());
  await page.locator(".m003-final-result").waitFor({ state: "visible" });
  const final = {
    section: await computed(page, ".study-resources"),
    resourceGrid: await computed(page, ".resource-grid"),
    resourceCard: await computed(page, ".resource-card"),
    word: await computed(page, ".resource-card h3"),
    meaning: await computed(page, ".resource-card p:not(.muted)"),
    phrase: await computed(page, ".resource-card p.muted"),
    passage: await computed(page, ".m003-final-result .story-text"),
  };
  await page.screenshot({ path: new URL(`final-${name}.png`, here).pathname, fullPage: true });
  const generationOptionsAfter = await options(page);
  const interceptedStreams = await page.evaluate(() => window.__cr309InterceptedStreams);
  const noHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= innerWidth,
  );

  results.viewports[name] = {
    viewport,
    interceptedStreams,
    quotaBefore: generationOptionsBefore.quota,
    quotaAfter: generationOptionsAfter.quota,
    noHorizontalOverflow,
    during,
    final,
  };
  await context.close();
}

const browser = await chromium.launch({ headless: true });
try {
  await run(browser, "desktop-1440", { width: 1440, height: 1000 });
  await run(browser, "mobile-390", { width: 390, height: 844 });
} finally {
  await browser.close();
}

results.backend_mutations = results.unexpected_mutations.length;
results.observation = {
  desktop: {
    duringGrid: results.viewports["desktop-1440"].during.planGrid.style.gridTemplateColumns,
    duringGap: results.viewports["desktop-1440"].during.planGrid.style.gap,
    duringCardBorder: results.viewports["desktop-1440"].during.planCard.style.borderTopWidth,
    finalGrid: results.viewports["desktop-1440"].final.resourceGrid.style.gridTemplateColumns,
    finalGap: results.viewports["desktop-1440"].final.resourceGrid.style.gap,
    finalCardBorder: results.viewports["desktop-1440"].final.resourceCard.style.borderTopWidth,
  },
  mobile: {
    duringGrid: results.viewports["mobile-390"].during.planGrid.style.gridTemplateColumns,
    duringGap: results.viewports["mobile-390"].during.planGrid.style.gap,
    finalGrid: results.viewports["mobile-390"].final.resourceGrid.style.gridTemplateColumns,
    finalGap: results.viewports["mobile-390"].final.resourceGrid.style.gap,
  },
};
fs.writeFileSync(
  new URL("computed-differences.json", here),
  JSON.stringify(results, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    captured: Object.keys(results.viewports),
    backend_mutations: results.backend_mutations,
    page_errors: results.page_errors,
  }),
);
