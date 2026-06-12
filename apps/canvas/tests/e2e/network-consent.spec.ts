// E2E — D-03 network-consent enforcement (the editor half).
//
// Two independent walls, proven separately:
//   AC-NET-1  the CSP `connect-src` HARD wall — even a direct `window.fetch`
//             to an external origin is refused by the browser (a same-realm or
//             worker bundle cannot bypass the in-process door); same-origin
//             still works. This is the audit fix (03 P10 / 08 X5).
//   AC-NET-2  the consent door is WIRED — a request surfaces the data-source
//             manifest (origins + purpose); the user grants a per-origin subset
//             and the door resolves to exactly that.
//   AC-NET-3  default-deny is the dismissal — Deny (and Esc) grant nothing.
//
// The consent door is driven through the dev-only `__consent` handle: no
// first-party bundle declares `capabilities.network` yet (all `network: false`),
// so nothing triggers the prompt in normal use, but the wiring is live and the
// dialog real. Mirrors how web-plugin.spec drives the (wired) asset door.

import { expect, test } from "@playwright/test";

import { openCanvas } from "../fidelity/canvas-driver";

type ConsentResult = {
  granted: string[];
  denied: string[];
  remembered: boolean;
};

type ConsentWindow = {
  __consent: {
    request: (origins: string[], purpose: string) => Promise<ConsentResult>;
  };
  __consentResult?: Promise<ConsentResult>;
};

test.describe("D-03 — network-consent enforcement", () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page);
  });

  test("AC-NET-1 — CSP connect-src refuses external fetch; same-origin works", async ({
    page,
  }) => {
    // A direct fetch to an external origin must trip a `connect-src`
    // securitypolicyviolation — the browser-level wall, independent of the
    // in-process door. (This is what a malicious/buggy bundle calling
    // window.fetch directly would hit.)
    const blocked = await page.evaluate(
      () =>
        new Promise<string | false>((resolve) => {
          document.addEventListener(
            "securitypolicyviolation",
            (e) => resolve(e.violatedDirective),
            { once: true },
          );
          // The fetch itself rejects too; swallow it — the violation event
          // is the assertion.
          void fetch("https://example.com/d03-probe").catch(() => {});
          setTimeout(() => resolve(false), 3_000);
        }),
    );
    expect(blocked).toMatch(/^connect-src/);

    // Control: a same-origin request is admitted by the floor.
    const sameOrigin = await page.evaluate(async () => {
      try {
        const r = await fetch("/");
        return r.ok;
      } catch {
        return false;
      }
    });
    expect(sameOrigin).toBe(true);
  });

  test("AC-NET-2 — consent door surfaces the manifest; a granted subset resolves", async ({
    page,
  }) => {
    // Start a request (two origins) without awaiting it in-page.
    await page.evaluate(() => {
      const w = globalThis as unknown as ConsentWindow;
      w.__consentResult = w.__consent.request(
        ["https://data.example.com", "https://cdn.example.com"],
        "Load the published dataset",
      );
    });

    // The prompt renders the manifest: purpose + both origins.
    await expect(page.getByTestId("consent-dialog")).toBeVisible();
    await expect(page.getByTestId("consent-dialog")).toContainText(
      "Load the published dataset",
    );
    await expect(page.getByTestId("consent-origin")).toHaveCount(2);

    // Grant only the first origin + remember. The `consent-origin` testid is
    // on the checkbox input, keyed by `data-origin`.
    await page
      .locator(
        '[data-testid="consent-origin"][data-origin="https://data.example.com"]',
      )
      .check();
    await page.getByTestId("consent-remember").check();
    await page.getByTestId("consent-allow").click();

    const result = await page.evaluate(
      () => (globalThis as unknown as ConsentWindow).__consentResult!,
    );
    expect(result.granted).toEqual(["https://data.example.com"]);
    expect(result.denied).toEqual(["https://cdn.example.com"]);
    expect(result.remembered).toBe(true);
    await expect(page.getByTestId("consent-dialog")).toBeHidden();
  });

  test("AC-NET-3 — Deny grants nothing (default-deny is the dismissal)", async ({
    page,
  }) => {
    await page.evaluate(() => {
      const w = globalThis as unknown as ConsentWindow;
      w.__consentResult = w.__consent.request(
        ["https://data.example.com"],
        "Load the published dataset",
      );
    });
    await expect(page.getByTestId("consent-dialog")).toBeVisible();
    await page.getByTestId("consent-deny").click();

    const result = await page.evaluate(
      () => (globalThis as unknown as ConsentWindow).__consentResult!,
    );
    expect(result.granted).toEqual([]);
    expect(result.denied).toEqual(["https://data.example.com"]);
    expect(result.remembered).toBe(false);
  });
});
