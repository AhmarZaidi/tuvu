import { expect, test } from "@playwright/test";

test.describe("responsive app navigation", () => {
  test("desktop uses rail navigation and can visit every Phase 1 route", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "Desktop-only navigation check");

    await page.goto("/shows");

    await expect(page.getByRole("navigation", { name: "Primary" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Watch next" })).toBeVisible();

    await page.getByRole("link", { name: "Movies" }).first().click();
    await expect(page.getByRole("heading", { name: "Movie library" })).toBeVisible();

    await page.getByRole("link", { name: "Explore" }).first().click();
    await expect(page.getByRole("heading", { name: "Find something good" })).toBeVisible();

    await page.getByRole("link", { name: "Profile" }).first().click();
    await expect(page.getByRole("heading", { name: "Your profile" })).toBeVisible();

    await page.goto("/messages");
    await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();

    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Preferences" })).toBeVisible();

    await page.goto("/import/tv-time");
    await expect(page.getByRole("heading", { name: "TV Time import" })).toBeVisible();

    await page.goto("/lists/default");
    await expect(page.getByRole("heading", { name: "List default" })).toBeVisible();

    await page.goto("/media/show/severance");
    await expect(page.getByRole("heading", { name: "Severance" })).toBeVisible();
  });

  test("mobile shows bottom navigation without text overlap", async ({ page }) => {
    test.skip(test.info().project.name !== "mobile", "Mobile-only navigation check");

    await page.goto("/shows");

    const bottomNav = page.locator(".bottom-nav");
    await expect(bottomNav).toBeVisible();
    await expect(page.locator(".desktop-rail")).toBeHidden();

    await page.getByRole("link", { name: "Explore" }).last().click();
    await expect(page.getByRole("heading", { name: "Find something good" })).toBeVisible();

    const navBox = await bottomNav.boundingBox();
    expect(navBox?.height).toBeGreaterThanOrEqual(60);

    const headings = await page.locator("h1, h2, .nav-link span, button").evaluateAll((nodes) =>
      nodes
        .filter((node) => {
          const rect = node.getBoundingClientRect();
          const style = window.getComputedStyle(node);
          return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
        })
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            text: node.textContent ?? "",
            fitsWidth: rect.width <= window.innerWidth,
            height: rect.height,
          };
        }),
    );

    expect(headings.every((item) => item.fitsWidth && item.height > 0)).toBe(true);
  });

  test("auth route renders the logged-out screen", async ({ page }) => {
    await page.goto("/auth");

    await expect(page.getByRole("heading", { name: "Tuvu" })).toBeVisible();
    await expect(page.getByRole("button", { name: /continue with passkey/i })).toBeVisible();
  });

  test("shell route changes keep cumulative layout shift low", async ({ page }) => {
    await page.addInitScript(() => {
      window.__tuvuCls = 0;

      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const layoutShift = entry as PerformanceEntry & {
            hadRecentInput?: boolean;
            value?: number;
          };

          if (!layoutShift.hadRecentInput) {
            window.__tuvuCls += layoutShift.value ?? 0;
          }
        }
      }).observe({ type: "layout-shift", buffered: true });
    });

    await page.goto("/shows");
    await expect(page.getByRole("heading", { name: "Watch next" })).toBeVisible();
    await page.goto("/movies");
    await expect(page.getByRole("heading", { name: "Movie library" })).toBeVisible();
    await page.goto("/explore");
    await expect(page.getByRole("heading", { name: "Find something good" })).toBeVisible();

    const cls = await page.evaluate(() => window.__tuvuCls);
    expect(cls).toBeLessThan(0.1);
  });
});
