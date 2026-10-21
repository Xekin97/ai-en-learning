import { expect, test, type Page, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";

const copySource = JSON.parse(
  readFileSync(
    new URL(
      "../../../.planning/milestones/M002-legacy-M003/design/copy.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const api = `${process.env.CR306_MOCK_ORIGIN ?? "http://127.0.0.1:38080"}/api/v1`;
const ready = (page: Page) =>
  page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true",
  );

test.beforeEach(async ({ request, context, baseURL }, info) => {
  await request.post(api + "/__test/admin-reset");
  await context.addCookies([
    { name: "wordweave_session", value: "admin", url: baseURL! },
    {
      name: "wordweave_ui_locale",
      value: info.project.name === "mobile" ? "en-US" : "zh-CN",
      url: baseURL!,
    },
  ]);
});

test("CR306 real AppDialog keeps raw JSON, stale probes, focus, and zero automatic probes", async ({
  page,
}, info) => {
  const lang = info.project.name === "mobile" ? "en" : "zh";
  const t = (key: string) => copySource.static[`${lang}.${key}`] as string;
  const writes: Record<string, unknown>[] = [];
  let probeCount = 0;
  page.on("request", (request) => {
    if (
      request.url().includes("/admin/model-providers/") &&
      request.method() === "PATCH"
    )
      writes.push(request.postDataJSON());
  });

  await page.goto("/admin/models");
  await ready(page);
  const opener = page
    .locator(".generic-provider-card")
    .getByRole("button", { name: t("gm.edit"), exact: true });
  await opener.click();
  const dialog = page.locator("#admin-model"),
    rows = dialog.locator(".generic-model-item"),
    body = dialog.locator(".dialog-body"),
    footer = dialog.locator(".dialog-actions");
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(
    true,
  );
  expect(
    await page.evaluate(() =>
      document.elementFromPoint(2, 2)?.closest("#admin-model")
        ? "dialog"
        : "background",
    ),
  ).toBe("dialog");
  await rows.first().locator(".generic-model-advanced > summary").click();
  const firstJson = rows.first().locator(".custom-parameters");
  await expect(firstJson).toHaveValue("{}");
  await expect(firstJson).toHaveAccessibleDescription(
    new RegExp(t("cr306.custom.help")),
  );
  await expect(dialog.getByText(t("cr306.save.no-call"))).toBeVisible();

  let delayedProbe: Route | null = null;
  await page.route("**/api/v1/admin/model-connection-test", (route) => {
    probeCount++;
    delayedProbe = route;
  });
  await firstJson.fill('{"temperature":0.4}');
  await rows
    .first()
    .getByRole("button", { name: t("gm.test"), exact: true })
    .click();
  await expect.poll(() => probeCount).toBe(1);
  expect(delayedProbe!.request().postDataJSON().custom_parameters).toEqual({
    temperature: 0.4,
  });
  await firstJson.fill('{"temperature":0.5}');
  await expect(rows.first().getByRole("status")).toHaveText(
    t("cr306.probe.stale"),
  );
  await delayedProbe!.fulfill({
    json: { data: { ok: true }, meta: { request_id: "late-probe" } },
  });
  await expect(rows.first().getByRole("status")).toHaveText(
    t("cr306.probe.stale"),
  );

  await dialog
    .getByRole("button", { name: t("gm.model.add"), exact: true })
    .click();
  await rows.nth(1).locator('[name="providerModelId"]').fill("Provider/Second");
  await rows.nth(1).locator(".generic-model-advanced > summary").click();
  const secondJson = rows.nth(1).locator(".custom-parameters");
  const invalidRaw = '{"reasoning":{"enabled":false,"enabled":true}}';
  await secondJson.fill(invalidRaw);
  await dialog.getByRole("button", { name: t("gm.save"), exact: true }).click();
  await expect(secondJson).toHaveValue(invalidRaw);
  await expect(secondJson).toHaveAttribute("aria-invalid", "true");
  await expect(secondJson).toBeFocused();
  await expect(dialog.getByText(t("cr306.error.duplicate_key"))).toBeVisible();
  await page.screenshot({
    path: `../tmp/browser-evidence/M002-legacy-M003/cr306-frontend/${info.project.name}-invalid-json.png`,
    fullPage: true,
  });
  expect(writes).toHaveLength(0);
  expect(probeCount).toBe(1);

  const headerBefore = await dialog.locator("h2").boundingBox();
  const footerBefore = await footer.boundingBox();
  await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  expect(await dialog.locator("h2").boundingBox()).toEqual(headerBefore);
  expect(await footer.boundingBox()).toEqual(footerBefore);

  const footerCancel = footer.getByRole("button", {
    name: t("cancel"),
    exact: true,
  });
  await footerCancel.click();
  const discard = page.locator("#model-discard");
  await expect(discard).toBeVisible();
  if (info.project.name === "desktop")
    await page.screenshot({
      path: "../tmp/browser-evidence/M002-legacy-M003/cr306-frontend/desktop-discard-confirm.png",
      fullPage: true,
    });
  await discard
    .getByRole("button", { name: t("gm.keep"), exact: true })
    .click();
  await expect(footerCancel).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(discard).toBeVisible();
  await discard
    .getByRole("button", { name: t("gm.keep"), exact: true })
    .click();
  await expect(footerCancel).toBeFocused();
  await dialog.locator(".dialog-close").click();
  await expect(discard).toBeVisible();
  await discard
    .getByRole("button", { name: t("gm.keep"), exact: true })
    .click();
  await page.mouse.click(2, 2);
  await expect(discard).toBeVisible();
  await discard
    .getByRole("button", { name: t("gm.keep"), exact: true })
    .click();

  await secondJson.fill('{"reasoning":{"enabled":false}}');
  await dialog.getByRole("button", { name: t("gm.save"), exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(writes).toHaveLength(1);
  expect(probeCount).toBe(1);
  expect(
    (writes[0]!.models as Array<Record<string, unknown>>).map(
      (model) => model.custom_parameters,
    ),
  ).toEqual([{ temperature: 0.5 }, { reasoning: { enabled: false } }]);

  await opener.click();
  await expect(rows).toHaveCount(2);
  await rows.first().locator(".generic-model-advanced > summary").click();
  await expect(rows.first().locator(".custom-parameters")).toHaveValue(
    /"temperature": 0.5/,
  );
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  if (info.project.name === "mobile") {
    const sizes = await Promise.all(
      [dialog.locator(".dialog-close"), footer.getByRole("button")].map(
        async (locator) => {
          const box = await locator.first().boundingBox();
          return box ? { width: box.width, height: box.height } : null;
        },
      ),
    );
    expect(
      sizes.every((size) => size && size.width >= 44 && size.height >= 44),
    ).toBe(true);
  }
  await page.screenshot({
    path: `../tmp/browser-evidence/M002-legacy-M003/cr306-frontend/${info.project.name}-model-dialog.png`,
    fullPage: true,
  });
});
