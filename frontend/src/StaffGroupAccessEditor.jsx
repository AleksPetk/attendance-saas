import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "./api.js";
import { LoadingState } from "./components.jsx";
import { localizedErrorMessage } from "./i18n/errorMessages.js";
import {
  StaffGroupAccessPanel,
  assignedGroupIds,
  clearStaffGroupSelection,
  restoreStaffGroupSelection,
  saveStaffGroupAccessFlow,
  selectVisibleStaffGroups,
  toggleStaffGroupAssignment,
} from "./staffGroupAccess.js";

export default function StaffGroupAccessEditor({ staff, onClose, onSaved, onError }) {
  const { t } = useTranslation(["staff", "errors"]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState([]);
  const [baselineIds, setBaselineIds] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [savedNotice, setSavedNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setSavedNotice("");
      try {
        const result = await api.getWorkspaceStaffGroupAccess(null, staff.id);
        if (cancelled) return;
        const nextItems = result.data?.items || [];
        setItems(nextItems);
        setBaselineIds(assignedGroupIds(nextItems));
      } catch (e) {
        if (!cancelled) onError(localizedErrorMessage(e, t));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [staff.id, onError, t]);

  if (loading) {
    return <LoadingState label={t("staff:groupAccess.loading")} />;
  }

  return (
    <StaffGroupAccessPanel
      username={staff.username}
      items={items}
      baselineIds={baselineIds}
      search={search}
      filter={filter}
      saving={saving}
      savedNotice={savedNotice}
      onSearchChange={setSearch}
      onFilterChange={setFilter}
      onToggleGroup={(groupId) => {
        setSavedNotice("");
        setItems((current) => toggleStaffGroupAssignment(current, groupId));
      }}
      onSelectVisible={(visibleIds) => {
        setSavedNotice("");
        setItems((current) => selectVisibleStaffGroups(current, visibleIds));
      }}
      onClearSelection={() => {
        setSavedNotice("");
        setItems((current) => clearStaffGroupSelection(current));
      }}
      onSave={async () => {
        setSaving(true);
        onError("");
        try {
          await saveStaffGroupAccessFlow({
            staffId: staff.id,
            items,
            saveAccess: (staffId, payload) =>
              api.setWorkspaceStaffGroupAccess(null, staffId, payload),
            onSaved: (savedItems, groupIds) => {
              setBaselineIds(groupIds);
              onSaved(savedItems);
            },
            onClose,
          });
        } catch (e) {
          onError(localizedErrorMessage(e, t));
        } finally {
          setSaving(false);
        }
      }}
      onCancel={() => {
        setItems((current) => restoreStaffGroupSelection(current, baselineIds));
        onClose();
      }}
    />
  );
}
