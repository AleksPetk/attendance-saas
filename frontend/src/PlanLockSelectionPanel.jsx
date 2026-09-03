import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, errorMessage } from "./api.js";
import { ErrorBanner, LoadingState } from "./components.jsx";
import { PlanLockSelectionForm } from "./planLockSelection.js";

export default function PlanLockSelectionPanel({
  kind,
  title,
  description,
  onSave,
  onCancel,
  startEmpty = false,
  enableSearch = false,
}) {
  const { t } = useTranslation("workspace");
  const [selection, setSelection] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadSelection() {
      setLoading(true);
      setError("");
      try {
        const result = await api.getPlanLockSelection(null, kind);
        if (cancelled) return;
        setSelection(result.data);
        // Downgrade resolution starts with nothing selected so Owner chooses deliberately.
        setSelectedIds(startEmpty ? [] : result.data.current_unlocked || []);
      } catch (loadError) {
        if (!cancelled) setError(errorMessage(loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadSelection();
    return () => {
      cancelled = true;
    };
  }, [kind, startEmpty]);

  async function confirm() {
    setSaving(true);
    setError("");
    try {
      await onSave(selectedIds);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label={t("planLock.loading")} />;

  return (
    <>
      <ErrorBanner message={error} />
      {selection ? (
        <PlanLockSelectionForm
          title={title}
          description={`${description} ${t("planLock.planAllows", { limit: selection.limit })}`}
          selection={selection}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
          onConfirm={confirm}
          onCancel={onCancel}
          saving={saving}
          enableSearch={enableSearch}
        />
      ) : null}
    </>
  );
}
