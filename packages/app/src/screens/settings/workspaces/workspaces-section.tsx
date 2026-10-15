import { useTranslation } from "react-i18next";
import { SettingsCard, SettingsSection, SettingsSwitch } from "@/components/settings";
import { useSidebarViewStore } from "@/stores/sidebar-view-store";

export function WorkspacesSection() {
  const { t } = useTranslation();
  const sortMode = useSidebarViewStore((state) => state.sortMode);
  const projectSortMode = useSidebarViewStore((state) => state.projectSortMode);
  const workspaceRunningFirst = useSidebarViewStore((state) => state.workspaceActivityRunningFirst);
  const projectRunningFirst = useSidebarViewStore((state) => state.projectActivityRunningFirst);
  const setWorkspaceRunningFirst = useSidebarViewStore(
    (state) => state.setWorkspaceActivityRunningFirst,
  );
  const setProjectRunningFirst = useSidebarViewStore(
    (state) => state.setProjectActivityRunningFirst,
  );
  const hint = (mode: typeof sortMode, sortLabel: string) =>
    mode === "recent"
      ? t("settings.workspaces.runningFirstHint")
      : t("settings.workspaces.disabledHint", {
          sortLabel,
          sortMode: t(`sidebar.display.sorting.${mode}`),
        });
  return (
    <SettingsSection title={t("settings.workspaces.sorting")}>
      <SettingsCard>
        <SettingsSwitch
          label={t("settings.workspaces.workspaceRunningFirst")}
          hint={hint(sortMode, t("sidebar.display.sorting.workspaces"))}
          value={workspaceRunningFirst}
          onValueChange={setWorkspaceRunningFirst}
          disabled={sortMode !== "recent"}
          testID="settings-workspaces-workspace-running"
        />
        <SettingsSwitch
          label={t("settings.workspaces.projectRunningFirst")}
          hint={hint(projectSortMode, t("sidebar.display.sorting.projects"))}
          value={projectRunningFirst}
          onValueChange={setProjectRunningFirst}
          disabled={projectSortMode !== "recent"}
          testID="settings-workspaces-project-running"
        />
      </SettingsCard>
    </SettingsSection>
  );
}
