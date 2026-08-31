const SERVICE_LAYER_TITLES = {
  core: "Core services",
  supporting: "Supporting services",
  peripheral: "Public services",
};

export function groupStatusComponents(components) {
  const list = Array.isArray(components) ? components : [];
  return Object.entries(SERVICE_LAYER_TITLES)
    .map(([id, title]) => ({
      id,
      title,
      items: list.filter((component) => component.layer === id),
    }))
    .filter((group) => group.items.length);
}

export function formatStatusTime(value) {
  if (!value) return "Not checked yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not checked yet";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function statusSnapshotContent(snapshot) {
  const current = snapshot?.current || {};
  return {
    current,
    overall: current.overall || { state: "unknown", label: "Status unavailable" },
    groups: groupStatusComponents(current.components),
    active: Array.isArray(snapshot?.incidents?.active) ? snapshot.incidents.active : [],
    recent: Array.isArray(snapshot?.incidents?.recent) ? snapshot.incidents.recent : [],
    maintenance: Array.isArray(snapshot?.maintenance?.windows)
      ? snapshot.maintenance.windows
      : [],
  };
}
