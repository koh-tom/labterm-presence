import { expect, test } from "@playwright/test";

const URL = "/?demo&p=month&from=2026-10-01&to=2026-10-31";

test("shows status, numbers and the month grid", async ({ page }) => {
  await page.goto(URL);
  await expect(page.getByText("在室", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("在室日")).toBeVisible();
  await expect(page.getByRole("rowheader")).toHaveCount(31);
});

test("clicking a row updates the day timeline", async ({ page }) => {
  await page.goto(URL);
  await page.getByRole("rowheader").nth(6).click();
  await expect(page.getByRole("heading", { level: 2 })).toContainText("10/7");
});

test("switches resolution", async ({ page }) => {
  await page.goto(URL);
  const row = page.getByRole("row").nth(1);
  const n30 = await row.getByRole("gridcell").count();
  await page.getByRole("button", { name: "15分" }).click();
  await expect(row.getByRole("gridcell")).toHaveCount(n30 * 2);
});

test("moves between months", async ({ page }) => {
  await page.goto(URL);
  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page.getByText("2026年11月")).toBeVisible();
  await expect(page.getByRole("rowheader")).toHaveCount(30);
});
