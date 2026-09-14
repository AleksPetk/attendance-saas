import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ApiError, endpoints } from "@checkstation/api";
import { requiredPlanSelectionCount } from "@checkstation/domain";
import { Alert, Button, LoadingState } from "./ui";
import { SearchField, SectionCard } from "./mobile";
import { useApp } from "../lib/AppProvider";
import { colors, radii, space, type } from "../theme/tokens";

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
    <View accessibilityRole="alert" style={styles.notice}>
      <Text style={styles.noticeTitle}>{title}</Text>
      <Text style={styles.noticeBody}>{notice}</Text>
      <Text style={styles.noticeHint}>{hint}</Text>
      <Button label={actionLabel} onPress={onChoose} />
    </View>
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
  const { api, refreshWorkspace, t } = useApp();
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
        if (!cancelled) setError(caught instanceof ApiError ? caught.message : t("common.error"));
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
      return;
    }
    if (selectedIds.length < limit) setSelectedIds([...selectedIds, id]);
  }

  async function confirm() {
    setSaving(true);
    setError("");
    try {
      await api.put(endpoints.planLockSelectionUpdate(), { kind, selected_ids: selectedIds });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t("common.error"));
      setSaving(false);
      return;
    }
    try {
      await refreshWorkspace();
    } catch {
      setError(t("common.error"));
      setSaving(false);
      return;
    }
    try {
      await onResolved();
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label={t("planLock.loading")} />;

  return (
    <SectionCard title={title} description={`${description} ${selection ? t("planLock.planAllows", { limit: selection.limit }) : ""}`}>
      <Alert message={error} />
      {selection ? (
        <View style={styles.panel}>
          <Text style={styles.count}>{t("planLock.selectedCount", { selected: selectedIds.length, limit })}</Text>
          {enableSearch ? <SearchField onChangeText={setSearch} placeholder={t("planLock.searchPlaceholder")} value={search} /> : null}
          {candidates.length ? visibleCandidates.map((candidate) => {
            const checked = selectedIds.includes(candidate.id);
            const disabled = !checked && selectedIds.length >= limit;
            const meta = candidateMeta(candidate, t);
            return (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked, disabled }}
                disabled={disabled}
                key={candidate.id}
                onPress={() => toggleCandidate(candidate.id)}
                style={[styles.candidate, checked && styles.candidateSelected, disabled && styles.candidateDisabled]}
              >
                <View style={[styles.box, checked && styles.boxSelected]}>{checked ? <Text style={styles.check}>✓</Text> : null}</View>
                <View style={styles.candidateCopy}>
                  <Text style={styles.candidateName}>{candidateDisplayName(candidate, t)}</Text>
                  {meta ? <Text style={styles.candidateMeta}>{meta}</Text> : null}
                </View>
              </Pressable>
            );
          }) : <Text style={styles.empty}>{t("planLock.noRecords")}</Text>}
          {enableSearch && candidates.length && !visibleCandidates.length ? <Text style={styles.empty}>{t("planLock.noMatches")}</Text> : null}
          <Text style={styles.guidance}>{t(requiredCount === 1 ? "planLock.guidance" : "planLock.guidancePlural", { count: requiredCount })}</Text>
          <Button disabled={!valid} label={saving ? t("common.saving") : t("planLock.confirmAvailability")} loading={saving} onPress={() => void confirm()} />
          <Button disabled={saving} label={t("common.cancel")} onPress={onCancel} variant="secondary" />
        </View>
      ) : null}
    </SectionCard>
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
    const haystack = [candidate.name, candidate.username, candidate.email, candidate.status, candidate.id != null ? String(candidate.id) : ""]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(query) || (candidate.id != null && `#${candidate.id}`.includes(query));
  });
}

const styles = StyleSheet.create({
  notice: { gap: space.sm, padding: space.lg, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.warningBorder, backgroundColor: colors.warningSoft },
  noticeTitle: { ...type.bodyStrong, color: colors.warningText },
  noticeBody: { ...type.body, color: colors.text },
  noticeHint: { ...type.caption, color: colors.textSecondary },
  panel: { gap: space.md },
  count: { ...type.bodyStrong, color: colors.bluePressed },
  candidate: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  candidateSelected: { borderColor: colors.blue, backgroundColor: colors.blueSoft },
  candidateDisabled: { opacity: 0.5 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  boxSelected: { borderColor: colors.blue, backgroundColor: colors.blue },
  check: { color: colors.surface, fontSize: 14, fontWeight: "700" },
  candidateCopy: { flex: 1, gap: 2 },
  candidateName: { ...type.bodyStrong, color: colors.text },
  candidateMeta: { ...type.caption, color: colors.textMuted },
  empty: { ...type.caption, color: colors.textMuted, textAlign: "center" },
  guidance: { ...type.caption, color: colors.textSecondary },
});
