import type { Page, TestInfo } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { test, expect } from "../support/fixtures";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";
import { renameModalInput, renameModalSubmit } from "../support/helpers/rename";
import type { SeedDaemonClient } from "../support/helpers/seed-client";

const MOBILE_VIEWPORT = { width: 390, height: 844 };

test.use({ viewport: MOBILE_VIEWPORT, deviceScaleFactor: 2 });

async function openTabSwitcher(page: Page) {
  await page.getByRole("button", { name: /Switch tabs/ }).click();
  const footer = page.getByRole("button", { name: "New terminal", exact: true });
  await expect(footer).toBeVisible();
  // Visibility alone passes while the sheet is still travelling up from below the viewport.
  await expect
    .poll(async () => {
      const bounds = await footer.boundingBox();
      return bounds ? bounds.y + bounds.height : Number.POSITIVE_INFINITY;
    })
    .toBeLessThanOrEqual(MOBILE_VIEWPORT.height);
}

async function captureScreen(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({ path: testInfo.outputPath(name + ".png") });
}

async function createTabFromSwitcher(page: Page, kind: "New agent" | "New terminal") {
  await openTabSwitcher(page);
  await page.getByRole("button", { name: kind, exact: true }).click();
  await expect(page.getByRole("button", { name: "Bottom sheet backdrop" })).toHaveCount(0);
}

async function fetchAgentTitle(client: SeedDaemonClient, agentId: string): Promise<string | null> {
  const result = await client.fetchAgents({ scope: "active" });
  return result.entries.find((entry) => entry.agent.id === agentId)?.agent.title ?? null;
}

/**
 * Compact "sessions dropdown" rename path. The desktop rename specs drive the right-click
 * `workspace-tab-context-*` menu, which portals into overlay-root and was never broken. This
 * exercises the tab switcher's per-session actions on a phone-sized viewport — the path that
 * regressed when the actions menu presented as a popover instead of a bottom sheet.
 */
test.describe("Workspace session rename (compact tab switcher)", () => {
  test("renames an agent session from the switcher's per-session actions sheet", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);

    await page.setViewportSize(MOBILE_VIEWPORT);
    const initialTitle = `switcher-rename-${randomUUID().slice(0, 8)}`;
    const session = await seedMockAgentWorkspace({
      repoPrefix: "workspace-switcher-rename-",
      title: initialTitle,
    });

    try {
      await openAgentRoute(page, session);
      await expect(page.getByTestId("workspace-tab-switcher-trigger")).toBeVisible({
        timeout: 30_000,
      });

      await captureScreen(page, testInfo, "compact-chat-header");

      // Open the sessions dropdown (a bottom sheet on compact).
      await openTabSwitcher(page);
      await expect(page.getByRole("button", { name: "Bottom sheet backdrop" }).first()).toBeVisible(
        {
          timeout: 10_000,
        },
      );

      // Open this session's "…" actions. Before the fix this tried to open a popover-Modal
      // that never surfaced over the sheet on native; it now opens as a stacked sheet.
      const menuBase = `workspace-tab-menu-agent_${session.agentId}`;
      const actionsTrigger = page.getByTestId(`${menuBase}-trigger`);
      await expect(actionsTrigger).toBeVisible({ timeout: 15_000 });
      await actionsTrigger.click();

      const renameItem = page.getByTestId(`${menuBase}-rename`);
      await expect(renameItem).toBeVisible({ timeout: 10_000 });
      await renameItem.click();

      const modalPrefix = `workspace-tab-rename-modal-agent-${session.agentId}`;
      const input = renameModalInput(page, modalPrefix);
      await expect(input).toBeVisible({ timeout: 10_000 });
      await expect(input).toHaveValue(initialTitle);

      const renamed = "Renamed from the dropdown";
      await input.fill(renamed);
      await renameModalSubmit(page, modalPrefix).click();

      await expect(input).toHaveCount(0, { timeout: 15_000 });
      await expect(page.getByText(renamed, { exact: true })).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByRole("button", { name: /Switch tabs/ })).toHaveText("1");
      await expect.poll(() => fetchAgentTitle(session.client, session.agentId)).toBe(renamed);
      await expect(page.getByRole("button", { name: "Bottom sheet backdrop" })).toHaveCount(1);
      await expect(page.getByText("Rename agent", { exact: true })).toBeHidden();
      await captureScreen(page, testInfo, "renamed-tab-in-switcher");
    } finally {
      await session.cleanup();
    }
  });
});

test("switcher footer creates tabs and returns to the existing chat", async ({
  page,
}, testInfo) => {
  const session = await seedMockAgentWorkspace({
    repoPrefix: "compact-header-actions-",
    title: "Existing chat",
  });
  try {
    await openAgentRoute(page, session);
    await expect(page.getByRole("button", { name: /Switch tabs/ })).toHaveText("1");

    await createTabFromSwitcher(page, "New terminal");
    await expect(page.getByRole("button", { name: /Switch tabs/ })).toHaveText("2");
    await expect(page.getByTestId("terminal-surface").filter({ visible: true })).toHaveCount(1);
    await captureScreen(page, testInfo, "compact-terminal-header");

    await createTabFromSwitcher(page, "New agent");
    await expect(page.getByRole("button", { name: /Switch tabs/ })).toHaveText("3");
    await expect(
      page.getByRole("textbox", { name: "Message agent..." }).filter({ visible: true }),
    ).toHaveCount(1);
    await captureScreen(page, testInfo, "compact-draft-header");

    await openTabSwitcher(page);
    await expect(page.getByText("Existing chat", { exact: true })).toBeVisible();
    await captureScreen(page, testInfo, "switcher-three-tabs");
    await page.getByText("Existing chat", { exact: true }).click();
    await expect(page.getByRole("button", { name: "Bottom sheet backdrop" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Switch tabs/ })).toHaveText("3");

    await openTabSwitcher(page);
    await expect(page.getByText("Existing chat", { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "Bottom sheet backdrop" })
      .click({ position: { x: 10, y: 10 } });
    await expect(page.getByRole("button", { name: "Bottom sheet backdrop" })).toHaveCount(0);
    await captureScreen(page, testInfo, "returned-chat-header");
  } finally {
    await session.cleanup();
  }
});

test.describe("Compact workspace header swipes", () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ hasTouch: true, isMobile: true });

  async function settleGesture(page: Page) {
    // Let queued gesture callbacks and the resulting React render reach the browser.
    await page.evaluate(async () => {
      await new Promise<number>((resolve) => requestAnimationFrame(resolve));
      await new Promise<number>((resolve) => requestAnimationFrame(resolve));
    });
  }

  async function swipeHeader(
    page: Page,
    deltaX: number,
    options: {
      deltaY?: number;
      cancel?: boolean;
      secondFinger?: boolean;
      fromSwitcher?: boolean;
    } = {},
  ) {
    const title = await page.getByTestId("workspace-header-title").boundingBox();
    if (!title) throw new Error("Workspace header is not visible");
    const trigger = await page.getByTestId("workspace-tab-switcher-trigger").boundingBox();
    if (!trigger) throw new Error("Tab switcher is not visible");
    const cdp = await page.context().newCDPSession(page);
    const x = options.fromSwitcher ? trigger.x + trigger.width / 2 : 150;
    const y = options.fromSwitcher ? trigger.y + trigger.height / 2 : title.y + title.height / 2;
    try {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y }],
      });
      for (let step = 1; step <= 8; step++) {
        const point = {
          x: x + (deltaX * step) / 8,
          y: y + ((options.deltaY ?? 0) * step) / 8,
          id: 0,
        };
        const touchPoints =
          options.secondFinger && step >= 4
            ? [point, { x: point.x + 20, y: point.y + 20, id: 1 }]
            : [point];
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints,
        });
      }
      await cdp.send("Input.dispatchTouchEvent", {
        type: options.cancel ? "touchCancel" : "touchEnd",
        touchPoints: [],
      });
    } finally {
      await cdp.detach();
    }
    await settleGesture(page);
    await expect(page.getByRole("button", { name: "Bottom sheet backdrop" })).toHaveCount(0);
  }

  test("swipes between open tabs in switcher order", async ({ page }, testInfo) => {
    const session = await seedMockAgentWorkspace({
      repoPrefix: "compact-header-swipe-",
      title: "Existing chat",
    });
    try {
      await openAgentRoute(page, session);
      const composer = page
        .getByRole("textbox", { name: "Message agent..." })
        .filter({ visible: true });
      await composer.fill("Retained chat draft");
      await createTabFromSwitcher(page, "New terminal");
      await expect(page.getByTestId("terminal-surface").filter({ visible: true })).toHaveCount(1);
      await createTabFromSwitcher(page, "New agent");
      await expect(page.getByRole("button", { name: /Switch tabs/ })).toHaveText("3");
      await composer.fill("Retained new agent draft");

      await swipeHeader(page, 130);
      await expect(page.getByTestId("terminal-surface").filter({ visible: true })).toHaveCount(1);
      await captureScreen(page, testInfo, "swiped-to-terminal");

      await swipeHeader(page, 130);
      await expect(composer).toHaveValue("Retained chat draft");
      await swipeHeader(page, 130);
      await expect(composer).toHaveValue("Retained chat draft");
      await swipeHeader(page, -130);
      await expect(page.getByTestId("terminal-surface").filter({ visible: true })).toHaveCount(1);
      await swipeHeader(page, -130);
      await expect(composer).toHaveValue("Retained new agent draft");
      await swipeHeader(page, -130);
      await expect(composer).toHaveValue("Retained new agent draft");
      await captureScreen(page, testInfo, "swiped-to-draft");
    } finally {
      await session.cleanup();
    }
  });

  test("ignores incomplete gestures, multiple fingers and mouse drags while preserving taps", async ({
    page,
  }) => {
    const session = await seedMockAgentWorkspace({
      repoPrefix: "compact-header-gesture-",
      title: "Touch gesture chat",
    });
    try {
      await openAgentRoute(page, session);
      const composer = page
        .getByRole("textbox", { name: "Message agent..." })
        .filter({ visible: true });
      await composer.fill("Single tab draft");
      await swipeHeader(page, -130);
      await expect(composer).toHaveValue("Single tab draft");
      await swipeHeader(page, 130);
      await expect(composer).toHaveValue("Single tab draft");

      await createTabFromSwitcher(page, "New agent");
      await composer.fill("Second tab draft");
      await swipeHeader(page, 30);
      await expect(composer).toHaveValue("Second tab draft");
      await swipeHeader(page, 10, { deltaY: 130 });
      await expect(composer).toHaveValue("Second tab draft");
      await swipeHeader(page, 100, { deltaY: 100 });
      await expect(composer).toHaveValue("Second tab draft");
      await swipeHeader(page, 130, { cancel: true });
      await expect(composer).toHaveValue("Second tab draft");
      await swipeHeader(page, 130, { secondFinger: true });
      await expect(composer).toHaveValue("Second tab draft");

      const title = await page.getByTestId("workspace-header-title").boundingBox();
      if (!title) throw new Error("Workspace header is not visible");
      await page.mouse.move(150, title.y + title.height / 2);
      await page.mouse.down();
      await page.mouse.move(280, title.y + title.height / 2, { steps: 8 });
      await page.mouse.up();
      await settleGesture(page);
      await expect(composer).toHaveValue("Second tab draft");

      // A swipe starting on the existing trigger must not also open its sheet.
      await swipeHeader(page, 80, { fromSwitcher: true });
      await expect(composer).toHaveValue("Single tab draft");
      await page.getByTestId("workspace-tab-switcher-trigger").tap();
      await expect(page.getByRole("button", { name: "New agent", exact: true })).toBeVisible();
      await page.getByText("New Agent", { exact: true }).click();
      await expect(composer).toHaveValue("Second tab draft");
    } finally {
      await session.cleanup();
    }
  });
});
