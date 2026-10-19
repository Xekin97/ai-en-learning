import { expect, test, type Page } from "@playwright/test";

const adminUsername = process.env.CR306_ADMIN_USERNAME;
const adminPassword = process.env.CR306_ADMIN_PASSWORD;

const ready = (page: Page) =>
  page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true",
  );

test("typed provider repository saves CR306 parameters to the isolated backend and reads them back", async ({
  page,
}) => {
  test.skip(
    !adminUsername || !adminPassword,
    "isolated backend credentials required",
  );
  const runID = Date.now().toString(36),
    providerName = `CR306 cross-layer ${runID}`,
    providerModelID = `synthetic/cr306-${runID}`;
  const writes: Array<{ method: string; body: Record<string, unknown> }> = [];
  let probes = 0;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/v1/admin/model-connection-test") probes++;
    if (
      url.pathname.startsWith("/api/v1/admin/model-providers") &&
      request.method() !== "GET"
    )
      writes.push({
        method: request.method(),
        body: request.postDataJSON() as Record<string, unknown>,
      });
  });

  await page.goto("/login");
  await ready(page);
  await page.locator('input[name="username"]').fill(adminUsername!);
  await page.locator('input[name="password"]').fill(adminPassword!);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.goto("/admin/models");
  await ready(page);
  await page.getByRole("button", { name: "Add provider" }).first().click();
  const dialog = page.locator("#admin-model"),
    row = dialog.locator(".generic-model-item").first();
  await dialog.locator('[name="connectionName"]').fill(providerName);
  await dialog.locator('[name="baseUrl"]').fill("http://127.0.0.1:1/v1");
  await dialog.locator('[name="apiKey"]').fill("synthetic-cross-layer-key");
  await row.locator('[name="providerModelId"]').fill(providerModelID);
  await row.locator(".generic-model-advanced > summary").click();
  await row.locator(".custom-parameters").fill('{"temperature":0.2}');
  await dialog.getByRole("button", { name: "Save provider" }).click();
  await expect(dialog).not.toBeVisible();

  const card = page.locator(".generic-provider-card", {
    hasText: providerName,
  });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Edit provider" }).click();
  await row.locator(".generic-model-advanced > summary").click();
  await expect(row.locator(".custom-parameters")).toHaveValue(
    /"temperature": 0.2/,
  );
  await row
    .locator(".custom-parameters")
    .fill('{"temperature":0.4,"reasoning":{"enabled":false}}');
  await dialog.getByRole("button", { name: "Save provider" }).click();
  await expect(dialog).not.toBeVisible();

  await page.reload();
  await ready(page);
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Edit provider" }).click();
  await row.locator(".generic-model-advanced > summary").click();
  expect(
    JSON.parse(await row.locator(".custom-parameters").inputValue()),
  ).toEqual({ temperature: 0.4, reasoning: { enabled: false } });
  expect(probes).toBe(0);
  expect(writes.map((write) => write.method)).toEqual(["POST", "PATCH"]);
  expect(
    writes.map(
      (write) =>
        (write.body.models as Array<Record<string, unknown>>)[0]
          ?.custom_parameters,
    ),
  ).toEqual([
    { temperature: 0.2 },
    { temperature: 0.4, reasoning: { enabled: false } },
  ]);
});
