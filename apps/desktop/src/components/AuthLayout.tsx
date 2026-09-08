import type { ReactNode } from "react";
import { Brand } from "./ui";
import { useApp } from "../lib/AppProvider";

export function AuthLayout({ title, lead, children, footnote }: { title: string; lead?: string; children: ReactNode; footnote?: ReactNode }) {
  const { locale, setLocale, t } = useApp();
  return <main className="auth-page"><aside className="auth-visual"><div style={{ display: "flex", alignItems: "center" }}><Brand /><div className="language-pills"><button className={locale === "en" ? "is-active" : ""} onClick={() => setLocale("en")}>EN</button><button className={locale === "ja" ? "is-active" : ""} onClick={() => setLocale("ja")}>JA</button></div></div><div className="auth-visual-copy"><h2>{t("dashboard.description")}</h2><div className="auth-orbit"><span className="orbit-node" /><span className="orbit-node" /><span className="orbit-node" /></div><p>{t("auth.ownerLead")}</p></div></aside><section className="auth-form-side"><div className="auth-card"><h1>{title}</h1>{lead ? <p className="auth-lead">{lead}</p> : null}{children}{footnote ? <div className="auth-footnote">{footnote}</div> : null}</div></section></main>;
}
