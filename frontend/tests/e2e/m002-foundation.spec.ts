import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const source = JSON.parse(
  readFileSync(
    new URL(
      "../../../.planning/milestones/M002/design/copy.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const fixtures = JSON.parse(
  readFileSync(
    new URL(
      "../../../.planning/milestones/M002/design/prototype/fixtures.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const text = (lang: string, key: string) =>
  (source.static[`${lang}.${key}`] ??
    source.templates[`${lang}.${key}`]) as string;
for (const lang of ["zh", "en"]) {
  test(`UI22 home content and layout ${lang}`, async ({
    page,
    context,
  }, testInfo) => {
    const locale = lang === "zh" ? "zh-CN" : "en-US";
    await context.addCookies([
      {
        name: "wordweave_ui_locale",
        value: locale,
        url: "http://127.0.0.1:3300",
      },
    ]);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.locator(".home-intro h1")).toHaveText(
      text(lang, "hero.title"),
    );
    await expect(page.locator(".nav a")).toHaveText(
      ["home", "explore", "create", "range", "library"].map((key) =>
        text(lang, `nav.${key}`),
      ),
    );
    await expect(page.locator(".home-paper")).toHaveCount(2);
    for (let i = 0; i < 2; i++) {
      const story = fixtures.hero.stories[i];
      await expect(
        page.locator(".home-paper").nth(i).locator(".home-word"),
      ).toHaveText(story.words);
      await expect(
        page.locator(".home-paper").nth(i).locator(".home-story"),
      ).toHaveText(
        story.parts
          .map((part: string | { word: string }) =>
            typeof part === "string" ? part : part.word,
          )
          .join(""),
      );
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const geometry = await page.locator(".home-hero").boundingBox();
    const header = await page.locator("header.topbar").boundingBox();
    expect(geometry!.y).toBeCloseTo(header!.height, 0);
    await page.screenshot({
      path: `../.planning/milestones/M002/implementation/evidence/frontend-home-${lang}-${testInfo.project.name}.png`,
      fullPage: true,
    });
  });
}
test("UI22 manual story selection stops the automatic turn", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true",
  );
  const stack = page.locator(".home-card-stack");
  await page.locator(".home-paper-back").focus();
  await expect(stack).toHaveAttribute("data-top", "0");
  await expect(stack).toHaveAttribute("data-motion", "paused");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(stack).toHaveAttribute("data-motion", "reduced");
  await page.locator(".home-paper-front").focus();
  await expect(stack).toHaveAttribute("data-top", "1");
});
test("explicit login shows welcome over reminder and keeps it for the designed duration", async ({
  page,
}) => {
  await page.goto("/login");
  await page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true",
  );
  await page
    .getByLabel(text("en", "i.username"), { exact: true })
    .fill("learner_e2e");
  await page
    .getByLabel(text("en", "i.password"), { exact: true })
    .fill("CorrectPass123!");
  await page.locator(".auth-form button[type=submit]").click();
  const toast = page.locator("#toast");
  await expect(toast).toBeVisible();
  await expect(toast.locator(".toast-days")).toHaveText(
    text("en", "welcome.elapsed").replace("{days}", "5"),
  );
  await expect(page.locator("dialog[open]")).toBeVisible();
  expect(await toast.evaluate((el) => el.parentElement?.tagName)).toBe(
    "DIALOG",
  );
  expect(await toast.evaluate((el) => el.matches(":popover-open"))).toBe(true);
  expect(
    await toast
      .locator(".toast-days")
      .evaluate((el) => getComputedStyle(el).fontSize),
  ).toBe("24px");
  const timing = await toast.evaluate((el) =>
    el.getAnimations().map((a) => a.effect?.getTiming().duration),
  );
  expect(timing).toContain(10600);
  await expect(toast).toBeHidden({ timeout: 13000 });
  await page.reload();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(toast).toBeHidden();
});
