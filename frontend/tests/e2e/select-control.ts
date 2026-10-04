import type { Locator } from "@playwright/test";
// Exercise the visible UI26 control, preserving canonical request values.
export async function selectValue(control: Locator, value: string | string[]) {
  const button = (await control.evaluate((e) => e.tagName === "SELECT"))
    ? control.locator("..").getByRole("combobox")
    : control;
  const native = button.locator("..").locator("select");
  const desired = Array.isArray(value) ? value : [value];
  const multiple = await native.evaluate(
    (e) => (e as HTMLSelectElement).multiple,
  );
  const options = await native.locator("option").evaluateAll((nodes) =>
    nodes.map((n) => ({
      value: (n as HTMLOptionElement).value,
      label: n.textContent?.trim() ?? "",
      selected: (n as HTMLOptionElement).selected,
    })),
  );
  await button.click();
  const popup = button
    .page()
    .locator(`[id="${await button.getAttribute("aria-controls")}"]`);
  for (const option of options) {
    if (
      multiple
        ? option.selected !== desired.includes(option.value)
        : desired.includes(option.value)
    )
      await popup
        .getByRole("option", { name: option.label, exact: true })
        .click();
  }
  if (multiple) await button.press("Escape");
}
