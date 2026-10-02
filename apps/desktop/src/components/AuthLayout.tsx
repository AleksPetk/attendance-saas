import type { ReactNode } from "react";
import { Brand } from "./ui";
import { DesktopLanguageMenu } from "./DesktopLanguageMenu";
import { useApp } from "../lib/AppProvider";

export function AuthLayout({
  title,
  lead,
  children,
  footnote,
  visualContent,
}: {
  title: string;
  lead?: string;
  children: ReactNode;
  footnote?: ReactNode;
  /** When set (Create Account), replaces the login promotional panel. */
  visualContent?: ReactNode;
}) {
  const { locale, setLocale, t } = useApp();
  return (
    <main className="auth-page">
      <aside className="auth-visual">
        <div style={{ display: "flex", alignItems: "center" }}>
          <Brand subtitle={t("workspace.subtitle")} />
        </div>
        {visualContent ? (
          visualContent
        ) : (
          <div className="auth-visual-copy">
            <h2>{t("dashboard.description")}</h2>
            <div className="auth-orbit">
              <span className="orbit-node" />
              <span className="orbit-node" />
              <span className="orbit-node" />
            </div>
            <p>{t("auth.ownerLead")}</p>
          </div>
        )}
      </aside>
      <section className="auth-form-side">
        <div className="auth-card">
          <header className="auth-header">
            <div className="auth-header-title-row">
              <h1>{title}</h1>
              <div className="auth-header-action">
                <DesktopLanguageMenu
                  label={t("common.changeLanguage")}
                  locale={locale}
                  onSelect={setLocale}
                />
              </div>
            </div>
            {lead ? <p className="auth-lead">{lead}</p> : null}
          </header>
          {children}
          {footnote ? <div className="auth-footnote">{footnote}</div> : null}
        </div>
      </section>
    </main>
  );
}
