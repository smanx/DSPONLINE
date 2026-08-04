import { expect, type Locator } from "@playwright/test";

export type SettingsCategoryId = "visual" | "performance" | "interaction" | "storage" | "statistics" | "other";

export async function selectSettingsCategory(
  operations: Locator,
  label: string,
  category: SettingsCategoryId,
): Promise<void> {
  const panel = operations.locator(".operations-settings");
  await panel.locator(".settings-category-tabs").getByRole("button", { name: label, exact: true }).click();
  await expect(panel).toHaveAttribute("data-settings-category", category);
}
