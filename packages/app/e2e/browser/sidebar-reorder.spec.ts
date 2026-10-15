import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../support/fixtures";
import { gotoAppShell } from "../support/helpers/app";
import { projectEquivalenceViewKey } from "../support/helpers/project-view-key";
import { getServerId } from "../support/helpers/server-id";
import { seedWorkspace } from "../support/helpers/seed-client";
import { waitForSidebarHydration } from "../support/helpers/workspace-ui";
import { seedMockAgentWorkspace } from "../support/helpers/mock-agent";

test("recent-activity sorting follows chat activity, preserves pins, and survives reload", async ({
  page,
}) => {
  const older = await seedMockAgentWorkspace({ repoPrefix: "recent-first-", title: "Older chat" });
  const newer = await seedMockAgentWorkspace({ repoPrefix: "recent-second-", title: "Newer chat" });
  try {
    await newer.client.sendAgentMessage(newer.agentId, "Reply with hello.");
    await newer.client.waitForAgentUpsert(
      newer.agentId,
      (snapshot) => snapshot.status === "idle",
      15_000,
    );
    await gotoAppShell(page);
    await waitForSidebarHydration(page);
    const olderId = `sidebar-workspace-row-${getServerId()}:${older.workspaceId}`;
    const newerId = `sidebar-workspace-row-${getServerId()}:${newer.workspaceId}`;
    const rows = page.locator(`[data-testid="${olderId}"], [data-testid="${newerId}"]`);
    await chooseSort(page, "workspace", "recent");
    await chooseSort(page, "project", "recent");
    await expect.poll(() => rowTestIds(rows)).toEqual([newerId, olderId]);

    await older.client.sendAgentMessage(older.agentId, "Reply with hello.");
    await expect.poll(() => rowTestIds(rows)).toEqual([olderId, newerId]);
    await page.reload();
    await expect.poll(() => rowTestIds(rows)).toEqual([olderId, newerId]);

    await newer.client.setWorkspacePinned(newer.workspaceId, true);
    await expect.poll(() => rowTestIds(rows)).toEqual([newerId, olderId]);
  } finally {
    await older.cleanup();
    await newer.cleanup();
  }
});

test("name sorting blocks dragging and running-first settings depend on each sort mode", async ({
  page,
}) => {
  const first = await seedWorkspace({ repoPrefix: "sort-first-", title: "Workspace 10" });
  const other = await seedWorkspace({ repoPrefix: "sort-other-" });
  try {
    await first.client.renameProject(first.projectId, "Project 10");
    await other.client.renameProject(other.projectId, "Project 2");
    const sibling = await first.client.createWorkspace({
      source: { kind: "directory", path: first.repoPath, projectId: first.projectId },
      title: "Workspace 2",
    });
    if (!sibling.workspace) throw new Error(sibling.error ?? "Failed to create sibling");
    await gotoAppShell(page);
    await waitForSidebarHydration(page);
    const firstId = `sidebar-workspace-row-${getServerId()}:${first.workspaceId}`;
    const siblingId = `sidebar-workspace-row-${getServerId()}:${sibling.workspace.id}`;
    const firstProjectId = `sidebar-project-row-${projectEquivalenceViewKey(first.projectKey)}`;
    const otherProjectId = `sidebar-project-row-${projectEquivalenceViewKey(other.projectKey)}`;
    const workspaceRows = page.locator(`[data-testid="${firstId}"], [data-testid="${siblingId}"]`);
    const projectRows = page.locator(
      `[data-testid="${firstProjectId}"], [data-testid="${otherProjectId}"]`,
    );
    await chooseSort(page, "workspace", "name");
    await chooseSort(page, "project", "name");
    await expect.poll(() => rowTestIds(workspaceRows)).toEqual([siblingId, firstId]);
    await expect.poll(() => rowTestIds(projectRows)).toEqual([otherProjectId, firstProjectId]);
    await attemptBlockedDrag(workspaceRows);
    await attemptBlockedDrag(projectRows);
    await openWorkspaceSettings(page);
    const workspaceSetting = page.getByTestId("settings-workspaces-workspace-running");
    const projectSetting = page.getByTestId("settings-workspaces-project-running");
    await expect(workspaceSetting.getByRole("switch")).toBeDisabled();
    await expect(projectSetting.getByRole("switch")).toBeDisabled();
    await expect(workspaceSetting).toContainText("Current sorting: Name");
    await expect(projectSetting).toContainText("Current sorting: Name");
    await gotoAppShell(page);
    await waitForSidebarHydration(page);
    await chooseSort(page, "workspace", "recent");
    await openWorkspaceSettings(page);
    await expect(workspaceSetting.getByRole("switch")).toBeEnabled();
    await expect(projectSetting.getByRole("switch")).toBeDisabled();
    await workspaceSetting.getByRole("switch").click();
    await page.reload();
    await expect(workspaceSetting.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    await gotoAppShell(page);
    await waitForSidebarHydration(page);
    await chooseSort(page, "project", "recent");
    await openWorkspaceSettings(page);
    await expect(projectSetting.getByRole("switch")).toBeEnabled();
    await expect(projectSetting.getByRole("switch")).toHaveAttribute("aria-checked", "false");
    await projectSetting.getByRole("switch").click();
    await gotoAppShell(page);
    await waitForSidebarHydration(page);
    await quickDragFirstRowAfterSecond(projectRows, pressProjectRow);
    await openWorkspaceSettings(page);
    await expect(projectSetting.getByRole("switch")).toBeDisabled();
    await expect(projectSetting).toContainText("Current sorting: Manual");
    await expect(workspaceSetting.getByRole("switch")).toBeEnabled();
    await gotoAppShell(page);
    await waitForSidebarHydration(page);
    await chooseSort(page, "project", "recent");
    await quickDragFirstRowAfterSecond(workspaceRows, pressWorkspaceRow);
    await openWorkspaceSettings(page);
    await expect(workspaceSetting.getByRole("switch")).toBeDisabled();
    await expect(projectSetting.getByRole("switch")).toBeEnabled();
    await expect(workspaceSetting.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  } finally {
    await first.cleanup();
    await other.cleanup();
  }
});

test("running-first drops finished agents while start-based order survives output and reload", async ({
  page,
}) => {
  const running = await seedMockAgentWorkspace({
    repoPrefix: "sort-running-",
    title: "Long running",
    model: "one-minute-stream",
  });
  const latest = await seedMockAgentWorkspace({
    repoPrefix: "sort-latest-",
    title: "Latest start",
  });
  try {
    await gotoAppShell(page);
    await waitForSidebarHydration(page);
    await chooseSort(page, "workspace", "recent");
    await chooseSort(page, "project", "recent");
    await openWorkspaceSettings(page);
    await page.getByTestId("settings-workspaces-project-running").getByRole("switch").click();
    await gotoAppShell(page);
    await waitForSidebarHydration(page);
    const oldId = `sidebar-workspace-row-${getServerId()}:${running.workspaceId}`;
    const latestId = `sidebar-workspace-row-${getServerId()}:${latest.workspaceId}`;
    const rows = page.locator(`[data-testid="${oldId}"], [data-testid="${latestId}"]`);
    await running.client.sendAgentMessage(running.agentId, "Reply with hello.");
    await running.client.waitForAgentUpsert(
      running.agentId,
      (snapshot) => snapshot.status === "running",
      15000,
    );
    await latest.client.sendAgentMessage(latest.agentId, "Reply with hello.");
    await expect.poll(() => rowTestIds(rows)).toEqual([latestId, oldId]);
    await latest.client.waitForAgentUpsert(
      latest.agentId,
      (snapshot) => snapshot.status === "idle",
      15000,
    );
    await expect.poll(() => rowTestIds(rows)).toEqual([oldId, latestId]);
    await openWorkspaceSettings(page);
    await page.getByTestId("settings-workspaces-project-running").getByRole("switch").click();
    await gotoAppShell(page);
    await waitForSidebarHydration(page);
    await expect.poll(() => rowTestIds(rows)).toEqual([latestId, oldId]);
    await page.reload();
    await waitForSidebarHydration(page);
    await expect.poll(() => rowTestIds(rows)).toEqual([latestId, oldId]);
  } finally {
    await running.cleanup();
    await latest.cleanup();
  }
});

async function chooseSort(
  page: Page,
  scope: "workspace" | "project",
  mode: "manual" | "name" | "recent",
) {
  await page.getByTestId("sidebar-display-preferences-menu").click();
  await page.getByTestId(`sidebar-display-${scope}-sorting`).click();
  await page.getByTestId(`sidebar-${scope}-sorting-${mode}`).click();
}

async function openWorkspaceSettings(page: Page) {
  await page.goto("/settings", { waitUntil: "domcontentloaded" });
  // App settings appear before the separate host workspace-management section.
  await page.getByRole("button", { name: "Workspaces", exact: true }).first().click();
  await page.getByTestId("settings-workspaces-workspace-running").waitFor();
}

async function attemptBlockedDrag(rows: Locator) {
  const before = await rowTestIds(rows);
  const source = await visibleBoundingBox(rows.nth(0));
  const target = await visibleBoundingBox(rows.nth(1));
  const page = rows.page();
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => rowTestIds(rows)).toEqual(before);
}

async function rowTestIds(rows: Locator) {
  return rows.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("data-testid")),
  );
}

async function visibleBoundingBox(row: Locator) {
  const box = await row.boundingBox();
  if (!box) throw new Error("Expected a visible draggable row");
  return box;
}

async function pressProjectRow(rows: Locator) {
  await rows.page().mouse.down();
}

async function pressWorkspaceRow(rows: Locator) {
  const solidScrimStop = rows
    .nth(0)
    .getByTestId("sidebar-workspace-trailing-scrim")
    .locator("stop")
    .nth(1);
  const hoverScrimColor = await solidScrimStop.getAttribute("stop-color");
  await rows.page().mouse.down();
  await expect.poll(() => solidScrimStop.getAttribute("stop-color")).not.toBe(hoverScrimColor);
}

async function quickDragFirstRowAfterSecond(
  rows: Locator,
  pressRow: (rows: Locator) => Promise<void>,
) {
  await expect(rows).toHaveCount(2);
  const before = await rowTestIds(rows);
  const sourceBox = await visibleBoundingBox(rows.nth(0));
  const targetBox = await visibleBoundingBox(rows.nth(1));

  const page = rows.page();
  const source = { x: sourceBox.x + sourceBox.width / 2, y: sourceBox.y + sourceBox.height / 2 };
  const target = { x: targetBox.x + targetBox.width / 2, y: targetBox.y + targetBox.height / 2 };

  await page.mouse.move(source.x, source.y);
  const trailingScrim = rows.nth(0).getByTestId("sidebar-workspace-trailing-scrim");
  await pressRow(rows);
  await page.mouse.move(source.x, source.y + 7);
  await expect(trailingScrim).toHaveCount(0);
  await page.mouse.move(target.x, target.y, { steps: 4 });
  await page.mouse.up();

  await expect.poll(() => rowTestIds(rows)).toEqual([before[1], before[0]]);
}

test("projects, workspaces, and pinned chats reorder with an immediate mouse drag", async ({
  page,
}) => {
  const firstProject = await seedWorkspace({ repoPrefix: "sidebar-reorder-first-" });
  const secondProject = await seedWorkspace({ repoPrefix: "sidebar-reorder-second-" });

  try {
    const secondWorkspace = await firstProject.client.createWorkspace({
      source: {
        kind: "directory",
        path: firstProject.repoPath,
        projectId: firstProject.projectId,
      },
      title: "Second workspace",
    });
    if (!secondWorkspace.workspace) {
      throw new Error(secondWorkspace.error ?? "Failed to seed a second workspace");
    }

    await gotoAppShell(page);
    await waitForSidebarHydration(page);

    const firstProjectTestId = `sidebar-project-row-${projectEquivalenceViewKey(firstProject.projectKey)}`;
    const secondProjectTestId = `sidebar-project-row-${projectEquivalenceViewKey(secondProject.projectKey)}`;
    await quickDragFirstRowAfterSecond(
      page.locator(`[data-testid="${firstProjectTestId}"], [data-testid="${secondProjectTestId}"]`),
      pressProjectRow,
    );
    const firstWorkspaceTestId = `sidebar-workspace-row-${getServerId()}:${firstProject.workspaceId}`;
    const secondWorkspaceTestId = `sidebar-workspace-row-${getServerId()}:${secondWorkspace.workspace.id}`;
    await quickDragFirstRowAfterSecond(
      page.locator(
        `[data-testid="${firstWorkspaceTestId}"], [data-testid="${secondWorkspaceTestId}"]`,
      ),
      pressWorkspaceRow,
    );

    await firstProject.client.setWorkspacePinned(firstProject.workspaceId, true);
    await secondProject.client.setWorkspacePinned(secondProject.workspaceId, true);
    const secondProjectWorkspaceTestId = `sidebar-workspace-row-${getServerId()}:${secondProject.workspaceId}`;
    await quickDragFirstRowAfterSecond(
      page.locator(
        `[data-testid="${firstWorkspaceTestId}"], [data-testid="${secondProjectWorkspaceTestId}"]`,
      ),
      pressWorkspaceRow,
    );
  } finally {
    await firstProject.cleanup();
    await secondProject.cleanup();
  }
});
