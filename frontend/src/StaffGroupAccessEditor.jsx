import { useEffect, useState } from "react";
import { api, errorMessage } from "./api.js";
import { LoadingState } from "./components.jsx";
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
        if (!cancelled) onError(errorMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [staff.id, onError]);

  if (loading) {
    return <LoadingState label="Loading group access…" />;
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
          onError(errorMessage(e));
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
