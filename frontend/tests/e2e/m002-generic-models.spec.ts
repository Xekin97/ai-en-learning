import { test, expect, type Route, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { selectValue } from "./select-control";
const source = JSON.parse(
  readFileSync(
    new URL(
      "../../../.planning/milestones/M002/design/copy.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const api = "http://127.0.0.1:38084/api/v1";
const ready = (page: Page) =>
  page.waitForFunction(
    () => document.documentElement.dataset.appReady === "true",
  );
for (const lang of ["en", "zh"]) {
  const t = (k: string) => source.static[lang + "." + k] as string;
  test.describe("UI31 " + lang, () => {
    test.beforeEach(async ({ request, context, baseURL }) => {
      await request.post(api + "/__test/admin-reset");
      await context.addCookies([
        { name: "wordweave_session", value: "admin", url: baseURL! },
        {
          name: "wordweave_ui_locale",
          value: lang === "en" ? "en-US" : "zh-CN",
          url: baseURL!,
        },
      ]);
    });
    test("new provider and editing its full model collection preserve IDs and settings", async ({
      page,
      request,
    }, info) => {
      const errors: string[] = [],
        writes: Record<string, unknown>[] = [],
        tests: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("request", (r) => {
        if (r.url().includes("/admin/model-providers") && r.method() !== "GET")
          writes.push(r.postDataJSON());
        if (r.url().endsWith("/model-connection-test")) tests.push(r.url());
      });
      await page.goto("/admin/models");
      await ready(page);
      await expect(page.locator(".generic-provider-card")).toHaveCount(1);
      await page
        .getByRole("button", { name: t("gm.add"), exact: true })
        .click();
      const dialog = page.locator("#admin-model"),
        rows = dialog.locator(".generic-model-item");
      await expect(dialog.locator("select")).toHaveCount(1);
      await dialog.locator('[name="connectionName"]').fill("My provider");
      await dialog
        .locator('[name="baseUrl"]')
        .fill("https://workspace.example/v1");
      await dialog.locator('[name="apiKey"]').fill("synthetic-browser-key");
      await rows
        .first()
        .locator('[name="providerModelId"]')
        .fill("Vendor/First");
      for (const protocol of [
        "openai_responses",
        "anthropic_messages",
        "openai_chat",
      ]) {
        await selectValue(dialog.locator("select"), protocol);
        await expect(
          rows.first().locator('[name="providerModelId"]'),
        ).toHaveValue("Vendor/First");
      }
      await rows.first().locator("summary").click();
      await rows.first().locator('[name="maxOutputTokens"]').fill("4096");
      await dialog
        .getByRole("button", { name: t("gm.model.add"), exact: true })
        .click();
      await rows
        .nth(1)
        .locator('[name="providerModelId"]')
        .fill("Vendor/Second");
      await dialog
        .getByRole("button", { name: t("gm.models.save"), exact: true })
        .click();
      await expect(dialog).not.toBeVisible();
      await expect(page.locator(".generic-provider-card")).toHaveCount(2);
      let result = (
        await (await request.get(api + "/admin/model-providers")).json()
      ).data;
      const created = result.items.find(
          (p: { connection: { name: string } }) =>
            p.connection.name === "My provider",
        ),
        ids = created.models.map((m: { id: string }) => m.id);
      const card = page.locator(
        `[data-provider-id="${created.connection.id}"]`,
      );
      await expect(card.locator(".generic-model-row")).toHaveCount(2);
      await expect(card.locator(".generic-provider-heading")).toContainText(
        "https://workspace.example/v1",
      );
      await card
        .getByRole("button", { name: t("gm.edit"), exact: true })
        .click();
      await expect(rows).toHaveCount(2);
      await expect(dialog.locator('[name="apiKey"]')).toHaveValue("");
      await dialog.locator('[name="connectionName"]').fill("Renamed provider");
      await rows.first().locator('[name="displayName"]').fill("Renamed first");
      await dialog
        .getByRole("button", { name: t("gm.model.add"), exact: true })
        .click();
      await rows
        .nth(2)
        .locator('[name="providerModelId"]')
        .fill("Vendor/First");
      await expect(
        dialog.getByRole("button", { name: t("gm.save"), exact: true }),
      ).toBeDisabled();
      await rows
        .nth(2)
        .locator('[name="providerModelId"]')
        .fill("Vendor/Third");
      await dialog
        .getByRole("button", { name: t("gm.save"), exact: true })
        .click();
      await expect(dialog).not.toBeVisible();
      await page.reload();
      await ready(page);
      result = (
        await (await request.get(api + "/admin/model-providers")).json()
      ).data;
      const updated = result.items.find(
        (p: { connection: { id: string } }) =>
          p.connection.id === created.connection.id,
      );
      expect(updated.connection.name).toBe("Renamed provider");
      expect(
        updated.models.slice(0, 2).map((m: { id: string }) => m.id),
      ).toEqual(ids);
      expect(updated.models[0]).toMatchObject({
        display_name: "Renamed first",
        max_output_tokens: 4096,
      });
      expect(updated.models).toHaveLength(3);
      expect(writes).toHaveLength(2);
      expect(tests).toHaveLength(0);
      expect(writes[1]).toMatchObject({
        connection: { api_key: "" },
        models: [{ id: ids[0] }, { id: ids[1] }, { id: null }],
      });
      expect(
        await page.evaluate(
          () => JSON.stringify(localStorage) + JSON.stringify(sessionStorage),
        ),
      ).not.toContain("synthetic-browser-key");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      expect(errors).toEqual([]);
      await page.screenshot({
        path: `../.planning/milestones/M002/implementation/evidence/provider-workspace31/list-${info.project.name}-${lang}.png`,
        fullPage: true,
      });
    });
    test("all models remain in their provider beyond twenty entries; tests target one model", async ({
      page,
      request,
    }, info) => {
      const before = (
          await (await request.get(api + "/admin/model-providers")).json()
        ).data,
        p = before.items[0];
      const entries = p.models.map((m: Record<string, unknown>) => ({
        id: m.id,
        display_name: m.display_name,
        provider_model_id: m.provider_model_id,
        output_mode: m.output_mode,
        enabled: m.enabled,
      }));
      for (let i = 1; i < 25; i++)
        entries.push({
          id: null,
          display_name: "Model " + i,
          provider_model_id: "Provider/Model-" + i,
          output_mode: "prompt",
          enabled: false,
        });
      expect(
        (
          await request.patch(
            api + "/admin/model-providers/" + p.connection.id,
            {
              data: {
                connection: {
                  name: p.connection.name,
                  protocol: p.connection.protocol,
                  base_url: p.connection.base_url,
                  api_key: "",
                },
                expected_revision: before.revision,
                models: entries,
              },
            },
          )
        ).status(),
      ).toBe(200);
      const pending: Route[] = [];
      await page.route("**/api/v1/admin/model-connection-test", (route) => {
        pending.push(route);
      });
      await page.goto("/admin/models");
      await ready(page);
      const card = page.locator(".generic-provider-card");
      await expect(card).toHaveCount(1);
      const list = card.locator(".generic-model-row");
      await expect(list).toHaveCount(25);
      await list
        .last()
        .getByRole("button", { name: t("gm.test"), exact: true })
        .click();
      await expect.poll(() => pending.length).toBe(1);
      await expect(
        list.last().getByRole("button", { name: t("gm.testing"), exact: true }),
      ).toHaveAttribute("aria-busy", "true");
      await expect(
        list.first().getByRole("button", { name: t("gm.test"), exact: true }),
      ).toHaveAttribute("aria-busy", "false");
      expect(pending[0]!.request().postDataJSON().provider_model_id).toBe(
        "Provider/Model-24",
      );
      await pending[0]!.fulfill({
        json: { data: { ok: true }, meta: { request_id: "list-stream" } },
      });
      await expect(list.last().getByRole("status")).toHaveText(t("gm.test.ok"));
      await card
        .getByRole("button", { name: t("gm.edit"), exact: true })
        .click();
      const dialog = page.locator("#admin-model"),
        rows = dialog.locator(".generic-model-item");
      await expect(rows).toHaveCount(25);
      await expect(dialog.getByRole("status")).toHaveCount(0);
      await dialog
        .getByRole("button", { name: t("gm.model.add"), exact: true })
        .click();
      await expect(rows).toHaveCount(26);
      await rows
        .nth(24)
        .getByRole("button", { name: t("gm.test"), exact: true })
        .click();
      await expect.poll(() => pending.length).toBe(2);
      await expect(
        rows.nth(25).getByRole("button", { name: t("gm.test"), exact: true }),
      ).toHaveAttribute("aria-busy", "false");
      expect(pending[1]!.request().postDataJSON().provider_model_id).toBe(
        "Provider/Model-24",
      );
      await pending[1]!.fulfill({
        status: 422,
        contentType: "application/problem+json",
        json: {
          type: "about:blank",
          title: "Invalid stream",
          status: 422,
          code: "model_connection_protocol",
          detail: "Synthetic stream failure",
          request_id: "draft-stream",
        },
      });
      await expect(rows.nth(24).getByRole("status")).toHaveText(
        t("gm.testing.format"),
      );
      await rows
        .nth(25)
        .getByRole("button", { name: t("gm.model.remove"), exact: true })
        .click();
      await expect(rows).toHaveCount(25);
      await expect(
        rows
          .first()
          .getByRole("button", { name: t("gm.model.remove"), exact: true }),
      ).toHaveCount(0);
      await rows.first().locator("summary").click();
      await rows.first().locator('[name="maxOutputTokens"]').fill("8192");
      await rows.first().scrollIntoViewIfNeeded();
      await expect
        .poll(async () => (await dialog.locator("h2").boundingBox())!.y)
        .toBeGreaterThanOrEqual(0);
      const footer = await dialog.locator(".dialog-actions").boundingBox();
      expect(footer!.y + footer!.height).toBeLessThanOrEqual(
        page.viewportSize()!.height,
      );
      expect(
        await rows
          .first()
          .locator(".model-advanced-fields")
          .evaluate((e) => parseFloat(getComputedStyle(e).rowGap)),
      ).toBeGreaterThanOrEqual(16);
      await page.screenshot({
        path: `../.planning/milestones/M002/implementation/evidence/provider-workspace31/editor-${info.project.name}-${lang}.png`,
        fullPage: true,
      });
    });
    test("revision recovery combines remote models with local edits and unsaved additions", async ({
      page,
      request,
    }) => {
      await page.goto("/admin/models");
      await ready(page);
      await page
        .locator(".generic-provider-card")
        .getByRole("button", { name: t("gm.edit"), exact: true })
        .click();
      const dialog = page.locator("#admin-model"),
        rows = dialog.locator(".generic-model-item");
      await rows.first().locator('[name="displayName"]').fill("Local edit");
      await dialog
        .getByRole("button", { name: t("gm.model.add"), exact: true })
        .click();
      await rows.nth(1).locator('[name="providerModelId"]').fill("Local/New");
      const before = (
          await (await request.get(api + "/admin/model-providers")).json()
        ).data,
        p = before.items[0];
      const updated = await request.patch(
        api + "/admin/model-providers/" + p.connection.id,
        {
          data: {
            connection: {
              name: "Remote provider name",
              protocol: p.connection.protocol,
              base_url: p.connection.base_url,
              api_key: "",
            },
            expected_revision: before.revision,
            models: p.models
              .map((m: Record<string, unknown>) => ({
                id: m.id,
                display_name: m.display_name,
                provider_model_id: m.provider_model_id,
                output_mode: m.output_mode,
                enabled: m.enabled,
              }))
              .concat([
                {
                  id: null,
                  provider_model_id: "Remote/New",
                  output_mode: "prompt",
                  enabled: false,
                },
              ]),
          },
        },
      );
      expect(updated.status()).toBe(200);
      await dialog
        .getByRole("button", { name: t("gm.save"), exact: true })
        .click();
      await expect(
        dialog.getByText(t("gm.conflict"), { exact: true }),
      ).toBeVisible();
      await dialog
        .getByRole("button", { name: t("gm.refresh"), exact: true })
        .click();
      await expect(rows).toHaveCount(3);
      await expect(rows.first().locator('[name="displayName"]')).toHaveValue(
        "Local edit",
      );
      await expect(rows.nth(1).locator('[name="providerModelId"]')).toHaveValue(
        "Local/New",
      );
      await expect(rows.nth(2).locator('[name="providerModelId"]')).toHaveValue(
        "Remote/New",
      );
      await expect(dialog.locator('[name="connectionName"]')).toHaveValue(
        "Remote provider name",
      );
      await dialog
        .getByRole("button", { name: t("cancel"), exact: true })
        .click();
      await page
        .locator("#model-discard")
        .getByRole("button", { name: t("gm.keep"), exact: true })
        .click();
      await expect(rows).toHaveCount(3);
      await dialog
        .getByRole("button", { name: t("gm.save"), exact: true })
        .click();
      await expect(dialog).not.toBeVisible();
      await page.reload();
      await ready(page);
      await expect(page.locator(".generic-provider-card")).toHaveCount(1);
      await expect(page.locator(".generic-model-row")).toHaveCount(3);
      await expect(page.locator(".generic-provider-heading")).toContainText(
        "Remote provider name",
      );
    });
    test("removing the last model retains an editable provider and the existing impact confirmation", async ({
      page,
    }) => {
      await page.goto("/admin/models");
      await ready(page);
      await page
        .locator(".generic-model-row")
        .getByRole("button", { name: t("a.remove"), exact: true })
        .click();
      const removal = page.locator("#model-removal");
      await expect(removal).toBeVisible();
      await removal
        .getByRole("button", { name: t("a.remove"), exact: true })
        .click();
      await expect(removal).not.toBeVisible();
      const card = page.locator(".generic-provider-card");
      await expect(card).toHaveCount(1);
      await expect(card.locator(".generic-model-row")).toHaveCount(0);
      await expect(
        card.getByText(t("gm.provider.empty"), { exact: true }),
      ).toBeVisible();
      await card
        .getByRole("button", { name: t("gm.edit"), exact: true })
        .click();
      const dialog = page.locator("#admin-model");
      await expect(dialog.locator(".generic-model-item")).toHaveCount(0);
      await dialog
        .getByRole("button", { name: t("gm.model.add"), exact: true })
        .click();
      await dialog.locator('[name="providerModelId"]').fill("Replacement/New");
      await dialog
        .getByRole("button", { name: t("gm.save"), exact: true })
        .click();
      await expect(dialog).not.toBeVisible();
      await expect(card.locator(".generic-model-row")).toHaveCount(1);
    });
    test("uncertain provider update preserves additions and prevents duplicate resubmission", async ({
      page,
    }) => {
      await page.goto("/admin/models");
      await ready(page);
      await page
        .locator(".generic-provider-card")
        .getByRole("button", { name: t("gm.edit"), exact: true })
        .click();
      const dialog = page.locator("#admin-model");
      await dialog
        .getByRole("button", { name: t("gm.model.add"), exact: true })
        .click();
      await dialog
        .locator('[name="providerModelId"]')
        .last()
        .fill("Pending/New");
      let calls = 0;
      await page.route("**/api/v1/admin/model-providers/*", async (route) => {
        calls++;
        await route.fulfill({
          status: 500,
          contentType: "application/problem+json",
          json: {
            type: "about:blank",
            title: "Unavailable",
            status: 500,
            code: "internal_error",
            detail: "Synthetic response lost",
            request_id: "uncertain-save",
          },
        });
      });
      const save = dialog.getByRole("button", {
        name: t("gm.save"),
        exact: true,
      });
      await save.click();
      await expect(
        dialog.getByText(t("gm.unknown"), { exact: true }),
      ).toBeVisible();
      await expect(save).toBeDisabled();
      await expect(
        dialog.locator('[name="providerModelId"]').last(),
      ).toHaveValue("Pending/New");
      expect(calls).toBe(1);
    });
  });
}
