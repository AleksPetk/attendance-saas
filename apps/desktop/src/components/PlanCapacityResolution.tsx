import { useEffect, useMemo, useState } from "react";
import { endpoints } from "@checkstation/api";
import { Alert, Button, Input, Loading, formatError } from "./ui";
import { useApp } from "../lib/AppProvider";
import { requiredPlanSelectionCount } from "../lib/planCapacity";

type Candidate = {
  id: number;
  name?: string;
  username?: string;
  email?: string;
  group_type?: string;
  role?: string;
  status?: string;
};

type Selection = {
  kind: string;
  limit: number;
  candidates: Candidate[];
};

export function PlanCapacityNotice({
  title,
  notice,
  hint,
  actionLabel,
  onChoose,
}: {
  title: string;
  notice: string;
  hint: string;
  actionLabel: string;
  onChoose: () => void;
}) {
  return (
    <section className="plan-selection-notice" role="status">
      <div>
        <strong>{title}</strong>
        <p>{notice}</p>
        <p className="hint">{hint}</p>
      </div>
      <Button onClick={onChoose} type="button">{actionLabel}</Button>
    </section>
  );
}

export function PlanLockSelectionPanel({
  kind,
  title,
  description,
  enableSearch = false,
  onCancel,
  onResolved,
}: {
  kind: string;
  title: string;
  description: string;
  enableSearch?: boolean;
  onCancel: () => void;
  onResolved: () => void | Promise<void>;
}) {
  const { api, auth, t } = useApp();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadSelection() {
      setLoading(true);
      setError("");
      try {
        const result = await api.get<Selection>(endpoints.planLockSelection(kind));
        if (cancelled) return;
        setSelection(result);
        setSelectedIds([]);
      } catch (caught) {
        if (!cancelled) setError(formatError(caught, t("common.error")));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadSelection();
    return () => {
      cancelled = true;
    };
  }, [api, kind, t]);

  const candidates = selection?.candidates || [];
  const limit = Math.max(0, Number(selection?.limit) || 0);
  const requiredCount = requiredPlanSelectionCount(limit, candidates.length);
  const valid = selectedIds.length === requiredCount;
  const visibleCandidates = useMemo(
    () => (enableSearch ? filterCandidates(candidates, search) : candidates),
    [candidates, enableSearch, search],
  );

  function toggleCandidate(id: number) {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((selectedId) => selectedId !== id));
    } else if (selectedIds.length < limit) {
      setSelectedIds([...selectedIds, id]);
    }
  }

  async function confirm() {
    setSaving(true);
    setError("");
    try {
      await api.put(endpoints.planLockSelectionUpdate(), { kind, selected_ids: selectedIds });
    } catch (caught) {
      setError(formatError(caught, t("common.error")));
      setSaving(false);
      return;
    }
    try {
      await auth.refreshWorkspace();
    } catch {
      window.location.reload();
      return;
    }
    try {
      await onResolved();
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loading label={t("planLock.loading")} />;

  return (
    <section aria-labelledby="plan-lock-selection-title" className="plan-lock-selection-panel">
      <Alert>{error}</Alert>
      {selection ? (
        <>
          <header className="plan-lock-selection-header">
            <div>
              <p className="eyebrow">{t("planLock.kicker")}</p>
              <h2 id="plan-lock-selection-title">{title}</h2>
              <p>{description} {t("planLock.planAllows", { limit: selection.limit })}</p>
            </div>
            <strong className="plan-lock-selection-count">{t("planLock.selectedCount", { selected: selectedIds.length, limit })}</strong>
          </header>
          {enableSearch ? (
            <Input
              aria-label={t("planLock.searchAria")}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("planLock.searchPlaceholder")}
              type="search"
              value={search}
            />
          ) : null}
          {candidates.length ? (
            <div className="plan-lock-candidate-list">
              {visibleCandidates.length ? visibleCandidates.map((candidate) => {
                const checked = selectedIds.includes(candidate.id);
                const disabled = !checked && selectedIds.length >= limit;
                const meta = candidateMeta(candidate, t);
                return (
                  <label className={`plan-lock-candidate${checked ? " is-selected" : ""}${disabled ? " is-disabled" : ""}`} key={candidate.id}>
                    <input checked={checked} disabled={disabled} onChange={() => toggleCandidate(candidate.id)} type="checkbox" />
                    <span>
                      <strong>{candidateDisplayName(candidate, t)}</strong>
                      {meta ? <small>{meta}</small> : null}
                    </span>
                  </label>
                );
              }) : <p className="plan-lock-selection-empty">{t("planLock.noMatches")}</p>}
            </div>
          ) : <p className="plan-lock-selection-empty">{t("planLock.noRecords")}</p>}
          <p className="plan-lock-selection-guidance">{t(requiredCount === 1 ? "planLock.guidance" : "planLock.guidancePlural", { count: requiredCount })}</p>
          <div className="plan-lock-selection-actions">
            <Button disabled={!valid} loading={saving} onClick={() => void confirm()} type="button">{saving ? t("common.saving") : t("planLock.confirmAvailability")}</Button>
            <Button disabled={saving} onClick={onCancel} type="button" variant="secondary">{t("common.cancel")}</Button>
          </div>
        </>
      ) : null}
    </section>
  );
}

function candidateDisplayName(candidate: Candidate, t: (key: string, vars?: Record<string, string | number>) => string) {
  return candidate.name || candidate.username || t("planLock.recordNumber", { id: candidate.id });
}

function candidateMeta(candidate: Candidate, t: (key: string, vars?: Record<string, string | number>) => string) {
  return [
    candidate.group_type === "structured" ? t("planLock.structuredGroup") : null,
    candidate.group_type === "standard" ? t("planLock.standardGroup") : null,
    candidate.email || null,
    candidate.status || null,
  ].filter(Boolean).join(" · ");
}

function filterCandidates(candidates: Candidate[], search: string) {
  const query = search.trim().toLowerCase();
  if (!query) return candidates;
  return candidates.filter((candidate) => {
    const haystack = [candidate.name, candidate.username, candidate.email, candidate.status, candidate.id != null ? String(candidate.id) : "", candidate.id != null ? `#${candidate.id}` : ""]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}
