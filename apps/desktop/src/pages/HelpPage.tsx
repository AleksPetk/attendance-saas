import { createAppConfig } from "@checkstation/config";
import { useApp } from "../lib/AppProvider";

export function HelpPage() {
  const { t } = useApp();
  const config = createAppConfig({
    apiBaseUrl: import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api",
  });
  return (
    <div>
      <h1>{t("help.title")}</h1>
      <p><a href={config.docsBaseUrl} target="_blank" rel="noreferrer">{t("help.openDocs")}</a></p>
      <p><a href={config.statusBaseUrl} target="_blank" rel="noreferrer">{t("help.openStatus")}</a></p>
    </div>
  );
}
