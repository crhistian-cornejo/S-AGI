import { useAtomValue, useSetAtom } from "jotai";
import {
  activeTabAtom,
  settingsActiveTabAtom,
  settingsReturnTabAtom,
  type SettingsTab,
} from "@/lib/atoms";

export function useOpenSettingsPage() {
  const currentTab = useAtomValue(activeTabAtom);
  const setActiveTab = useSetAtom(activeTabAtom);
  const setSettingsTab = useSetAtom(settingsActiveTabAtom);
  const setReturnTab = useSetAtom(settingsReturnTabAtom);

  return (tab?: SettingsTab) => {
    if (tab) setSettingsTab(tab);
    if (currentTab !== "settings") {
      setReturnTab(currentTab);
    }
    setActiveTab("settings");
  };
}

