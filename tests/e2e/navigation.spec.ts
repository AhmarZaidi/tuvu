import { expect, test } from "@playwright/test";

async function mockSignedInUser(page: import("@playwright/test").Page) {
  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          user: {
            id: "usr_test",
            email: null,
            username: "test_user",
            displayName: "Test User",
          },
          profile: {
            bio: "",
            visibility: "private",
            preferredLanguage: "en",
            preferredRegion: "US",
            avatarUploadId: null,
            bannerUploadId: null,
            avatarUrl: null,
            bannerUrl: null,
          },
          csrfToken: "csrf",
        },
      }),
    });
  });
}

async function mockSignedOutUser(page: import("@playwright/test").Page) {
  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "unauthorized",
          message: "Authentication is required.",
        },
      }),
    });
  });
}

test.describe("responsive app navigation", () => {
  test("desktop uses rail navigation and can visit every Phase 1 route", async ({ page }) => {
    test.skip(test.info().project.name !== "desktop", "Desktop-only navigation check");
    await mockSignedInUser(page);

    await page.goto("/shows");

    await expect(page.getByRole("navigation", { name: "Primary" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Watch next" })).toBeVisible();

    await page.getByRole("link", { name: "Movies" }).first().click();
    await expect(page.getByRole("heading", { name: "Movie library" })).toBeVisible();

    await page.getByRole("link", { name: "Books" }).first().click();
    await expect(page.getByRole("heading", { name: "Book library" })).toBeVisible();

    await page.getByRole("link", { name: "Games" }).first().click();
    await expect(page.getByRole("heading", { name: "Game library" })).toBeVisible();

    await page.getByRole("link", { name: "Profile" }).first().click();
    await expect(page.getByRole("heading", { name: "Your profile" })).toBeVisible();

    await page.goto("/profile/messages");
    await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();

    await page.goto("/profile/settings");
    await expect(page.getByRole("heading", { name: "Preferences" })).toBeVisible();

    await page.goto("/profile/import/tv-time");
    await expect(page.getByRole("heading", { name: "TV Time import" })).toBeVisible();

    await page.goto("/lists/default");
    await expect(page.getByRole("heading", { name: "List default" })).toBeVisible();

    await page.goto("/media/show/severance");
    await expect(page.getByRole("heading", { name: "Severance" })).toBeVisible();
  });

  test("mobile shows bottom navigation without text overlap", async ({ page }) => {
    test.skip(test.info().project.name !== "mobile", "Mobile-only navigation check");
    await mockSignedInUser(page);

    await page.goto("/shows");

    const bottomNav = page.locator(".bottom-nav");
    await expect(bottomNav).toBeVisible();
    await expect(page.locator(".desktop-rail")).toBeHidden();

    await expect(page.getByRole("link", { name: "Books" }).last()).toBeVisible();
    await expect(page.getByRole("link", { name: "Games" }).last()).toBeVisible();
    await expect(page.getByRole("link", { name: "Movies" }).last()).toBeVisible();
    await expect(page.getByRole("link", { name: "Shows" }).last()).toBeVisible();
    await page.getByRole("link", { name: "Profile" }).last().click();
    await expect(page.getByRole("heading", { name: "Your profile" })).toBeVisible();
    await page.getByRole("link", { name: "Settings" }).first().click();
    await expect(page.getByRole("heading", { name: "Preferences" })).toBeVisible();

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
    await mockSignedOutUser(page);
    await page.goto("/auth");

    await expect(page.getByRole("heading", { name: "Tuvu" })).toBeVisible();
    await expect(page.getByRole("button", { name: /create account/i })).toBeVisible();
  });

  test("shell route changes keep cumulative layout shift low", async ({ page }) => {
    await mockSignedInUser(page);

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
    await page.goto("/profile/explore");
    await expect(page.getByRole("heading", { name: "Find something good" })).toBeVisible();

    const cls = await page.evaluate(() => window.__tuvuCls);
    expect(cls).toBeLessThan(0.1);
  });
});
