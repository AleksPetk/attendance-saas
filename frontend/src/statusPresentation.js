export function serviceLayerTitles(t) {
  return {
    core: t("account:statusPanel.layerCore"),
    supporting: t("account:statusPanel.layerSupporting"),
    peripheral: t("account:statusPanel.layerPeripheral"),
  };
}

export function groupStatusComponents(components, titles) {
  const list = Array.isArray(components) ? components : [];
  const layerTitles = titles || {
    core: "Core services",
    supporting: "Supporting services",
    peripheral: "Public services",
  };
  return Object.entries(layerTitles)
    .map(([id, title]) => ({
      id,
      title,
      items: list.filter((component) => component.layer === id),
    }))
    .filter((group) => group.items.length);
}

export function formatStatusTime(value, locale = "en", notCheckedLabel = "Not checked yet") {
  if (!value) return notCheckedLabel;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return notCheckedLabel;
  const lang = locale === "ja" ? "ja" : "en";
  return new Intl.DateTimeFormat(lang, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function statusSnapshotContent(snapshot, titles) {
  const current = snapshot?.current || {};
  return {
    current,
    overall: current.overall || { state: "unknown", label: "Status unavailable" },
    groups: groupStatusComponents(current.components, titles),
    active: Array.isArray(snapshot?.incidents?.active) ? snapshot.incidents.active : [],
    recent: Array.isArray(snapshot?.incidents?.recent) ? snapshot.incidents.recent : [],
    maintenance: Array.isArray(snapshot?.maintenance?.windows)
      ? snapshot.maintenance.windows
      : [],
  };
}
