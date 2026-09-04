import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, errorMessage } from "./api.js";
import AccountSignInMethodsPanel from "./AccountSignInMethodsPanel.jsx";
import AccountInfoPanel from "./AccountInfoPanel.js";
import AccountTutorialPanel from "./AccountTutorialPanel.jsx";
import AccountStatusPanel from "./AccountStatusPanel.jsx";
import { openStripePortalSafely } from "./billingExternalLinks.js";
import { AccountSettingsSection } from "./accountAccordion.js";
import {
  accountSectionMeta,
  isAccountSectionId,
  resolveAccountSection,
} from "./accountNavigation.js";
import {
  AccountBillingPanel,
  AccountSubNav,
  AccountSubscriptionPanel,
} from "./accountPanels.js";
import {
  Badge,
  CodeBadge,
  ErrorBanner,
  Field,
  CopyButton,
  LoadingState,
  PageHeader,
  PasswordInput,
  SuccessBanner,
  usePasswordVisibility,
} from "./components.jsx";
import { localizedErrorMessage } from "./i18n/errorMessages.js";
import i18n from "./i18n/index.js";
import { usePageTitle } from "./i18n/usePageTitle.js";
import { useLanguage } from "./i18n/LanguageProvider.jsx";
import {
  canManageSubscription,
  canViewBilling,
} from "./workspaceSession.js";
import {
  emailAccordionStatusPills,
  emailAccordionStatusSummary,
  twoFactorStatusPills,
} from "./accountScreenUi.js";
import {
  isOAuthVerifiedResult,
  oauthAccountSecurityResultMessage,
  oauthStartUrl,
  passwordNotAvailableGuidance,
  signInMethodsStatusPills,
  signInMethodsStatusSummary,
} from "./signInMethodsUi.js";

function fieldError(error, name) {
  const value = error?.data?.[name];
  if (Array.isArray(value) && value.length) return value[0];
  if (typeof value === "string") return value;
  return "";
}

function sensitiveActionErrorMessage(error) {
  return passwordNotAvailableGuidance(error) || errorMessage(error);
}

function EmailActionRow({ label, email, status, statusVariant, hint, children }) {
  return (
    <div className="account-email-block">
      <div className="account-email-row">
        <div>
          <p className="account-email-label">{label}</p>
          {email ? <strong>{email}</strong> : <span className="hint">{i18n.t("account:notAdded")}</span>}
          {hint ? <p className="hint">{hint}</p> : null}
        </div>
        {status ? <Badge variant={statusVariant}>{status}</Badge> : null}
      </div>
      {children}
    </div>
  );
}

export default function AccountScreen({ session, setSession, onAccountDeleted }) {
  const { t } = useTranslation(["account", "billing", "workspace", "common", "errors"]);
  const { locale } = useLanguage();
  const workspaceContentLang = locale === "ja" ? "ja" : "en";
  const { section: sectionParam } = useParams();
  usePageTitle("pageTitles.account", { ns: "workspace" });
  const billingAllowed =
    canViewBilling(session) && canManageSubscription(session);
  const section = resolveAccountSection(sectionParam, session);
  const sectionMeta = accountSectionMeta(section, session);
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState(null);
  const [error, setError] = useState("");
  const [subscriptionSession, setSubscriptionSession] = useState(session);
  const [billing, setBilling] = useState(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState("");
  const [billingInvoices, setBillingInvoices] = useState([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoicesError, setInvoicesError] = useState("");
  const [billingBusy, setBillingBusy] = useState("");
  const [confirmingCheckout, setConfirmingCheckout] = useState(false);
  const [checkoutNotice, setCheckoutNotice] = useState("");
  const [portalNotice, setPortalNotice] = useState("");
  const [emailSuccess, setEmailSuccess] = useState("");
  const [emailError, setEmailError] = useState("");

  const [primaryOpen, setPrimaryOpen] = useState(false);
  const [primaryEmail, setPrimaryEmail] = useState("");
  const [primaryPassword, setPrimaryPassword] = useState("");
  const [primaryFieldErrors, setPrimaryFieldErrors] = useState({});
  const [primarySaving, setPrimarySaving] = useState(false);

  const [backupOpen, setBackupOpen] = useState(false);
  const [backupEmail, setBackupEmail] = useState("");
  const [backupPassword, setBackupPassword] = useState("");
  const [backupFieldErrors, setBackupFieldErrors] = useState({});
  const [backupSaving, setBackupSaving] = useState(false);
  const [backupRemoveOpen, setBackupRemoveOpen] = useState(false);
  const [backupRemovePassword, setBackupRemovePassword] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleteFieldErrors, setDeleteFieldErrors] = useState({});
  const [deleting, setDeleting] = useState(false);
  const [deleteCode, setDeleteCode] = useState("");
  const [deleteRecoveryCode, setDeleteRecoveryCode] = useState("");
  const [deleteUseRecovery, setDeleteUseRecovery] = useState(false);
  const [deleteSubscriptionBlocked, setDeleteSubscriptionBlocked] = useState(false);
  const [emailExpanded, setEmailExpanded] = useState(false);
  const [signInMethodsExpanded, setSignInMethodsExpanded] = useState(false);
  const [signInMethodsNotice, setSignInMethodsNotice] = useState("");
  const [signInMethodsError, setSignInMethodsError] = useState("");
  const [oauthReauthReady, setOauthReauthReady] = useState(false);
  const [passwordExpanded, setPasswordExpanded] = useState(false);
  const [twoFactorExpanded, setTwoFactorExpanded] = useState(false);
  const [twoFactorAction, setTwoFactorAction] = useState(null); // "setup" | "regen" | "disable"

  // Setup flow (disabled -> pending -> enabled)
  const [setupPassword, setSetupPassword] = useState("");
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [setupQrDataUri, setSetupQrDataUri] = useState("");
  const [setupKey, setSetupKey] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [setupRecoveryCodes, setSetupRecoveryCodes] = useState(null);
  const [setupStep, setSetupStep] = useState("password"); // "password" | "verifying"

  // Enabled-management flows
  const [regenPassword, setRegenPassword] = useState("");
  const [regenBusy, setRegenBusy] = useState(false);
  const [regenError, setRegenError] = useState("");
  const [regenUseRecoveryCode, setRegenUseRecoveryCode] = useState(false);
  const [regenCode, setRegenCode] = useState("");
  const [regenRecoveryCode, setRegenRecoveryCode] = useState("");
  const [regenRecoveryCodes, setRegenRecoveryCodes] = useState(null);

  const [disablePassword, setDisablePassword] = useState("");
  const [disableBusy, setDisableBusy] = useState(false);
  const [disableError, setDisableError] = useState("");
  const [disableUseRecoveryCode, setDisableUseRecoveryCode] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const [disableRecoveryCode, setDisableRecoveryCode] = useState("");
  const newPasswordVisibility = usePasswordVisibility();
  const emailPasswordVisibility = usePasswordVisibility();

  const loadAccount = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.account();
      setAccount(result.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setSubscriptionSession(session);
  }, [session]);

  const refreshWorkspaceSession = useCallback(async () => {
    try {
      const result = await api.loadWorkspace(null);
      const next = { workspace: result.data };
      setSubscriptionSession(next);
      if (typeof setSession === "function") {
        setSession(next);
      }
      return next;
    } catch {
      return null;
    }
  }, [setSession]);

  const loadBilling = useCallback(async () => {
    setBillingLoading(true);
    setBillingError("");
    try {
      const result = await api.getBilling();
      const state = result.data;
      setBilling(state);
      if (state?.purchase_source === "stripe" && state?.actions?.can_open_portal) {
        setInvoicesLoading(true);
        setInvoicesError("");
        try {
          const invoicesResult = await api.listBillingInvoices();
          setBillingInvoices(invoicesResult.data?.invoices || []);
        } catch (err) {
          setBillingInvoices([]);
          setInvoicesError(errorMessage(err));
        } finally {
          setInvoicesLoading(false);
        }
      } else {
        setBillingInvoices([]);
        setInvoicesError("");
        setInvoicesLoading(false);
      }
      return state;
    } catch (err) {
      setBillingError(errorMessage(err));
      setBillingInvoices([]);
      setInvoicesError("");
      return null;
    } finally {
      setBillingLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!billingAllowed) return undefined;
    if (section !== "subscription" && section !== "billing") return undefined;
    let cancelled = false;
    async function refresh() {
      await refreshWorkspaceSession();
      if (cancelled) return;
      await loadBilling();
    }
    refresh();
    return () => {
      cancelled = true;
    };
  }, [section, billingAllowed, refreshWorkspaceSession, loadBilling]);

  useEffect(() => {
    if (!billingAllowed) return undefined;
    if (section !== "subscription" && section !== "billing") return undefined;
    const checkout = searchParams.get("checkout");
    const portal = searchParams.get("portal");
    if (!checkout && !portal) return undefined;

    let cancelled = false;
    let timer = null;
    let attempts = 0;

    async function handleReturn() {
      if (checkout === "cancelled") {
        setCheckoutNotice(t("account:checkout.cancelled"));
        setSearchParams({}, { replace: true });
        return;
      }
      if (portal === "return") {
        setPortalNotice(t("account:checkout.portalReturn"));
        await refreshWorkspaceSession();
        if (cancelled) return;
        await loadBilling();
        if (cancelled) return;
        setPortalNotice(t("account:checkout.portalRefreshed"));
        setSearchParams({}, { replace: true });
        return;
      }
      if (checkout === "success") {
        setConfirmingCheckout(true);
        setCheckoutNotice("");
        const poll = async () => {
          if (cancelled) return;
          attempts += 1;
          await refreshWorkspaceSession();
          if (cancelled) return;
          const state = await loadBilling();
          if (cancelled) return;
          const activated =
            state &&
            (state.status === "active" ||
              state.status === "trialing" ||
              state.status === "past_due");
          if (activated || attempts >= 8) {
            setConfirmingCheckout(false);
            setCheckoutNotice(
              activated
                ? t("account:checkout.confirmed")
                : t("account:checkout.stillConfirming"),
            );
            setSearchParams({}, { replace: true });
            return;
          }
          timer = window.setTimeout(poll, 1500);
        };
        poll();
      }
    }

    handleReturn();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [section, billingAllowed, searchParams, setSearchParams, refreshWorkspaceSession, loadBilling]);

  async function handleStartCheckout(plan, interval) {
    setBillingBusy("checkout");
    setBillingError("");
    try {
      await api.csrf();
      const result = await api.startBillingCheckout({ plan, interval });
      const url = result.data?.checkout_url;
      if (!url) throw { data: { detail: t("account:checkout.urlMissing") } };
      window.location.assign(url);
    } catch (err) {
      setBillingError(errorMessage(err));
      setBillingBusy("");
    }
  }

  async function handlePreviewUpgrade() {
    setBillingBusy("preview");
    setBillingError("");
    try {
      await api.csrf();
      const result = await api.previewBillingUpgrade();
      return result.data;
    } finally {
      setBillingBusy("");
    }
  }

  async function handleConfirmUpgrade() {
    setBillingBusy("upgrade");
    setBillingError("");
    try {
      await api.csrf();
      const result = await api.applyBillingUpgrade();
      setBilling(result.data);
      await refreshWorkspaceSession();
    } finally {
      setBillingBusy("");
    }
  }

  async function handleScheduleDowngrade(interval) {
    setBillingBusy("downgrade");
    setBillingError("");
    try {
      await api.csrf();
      const payload =
        interval === "monthly" || interval === "yearly" ? { interval } : {};
      const result = await api.scheduleBillingDowngrade(payload);
      setBilling(result.data);
      await refreshWorkspaceSession();
    } finally {
      setBillingBusy("");
    }
  }

  async function handleCancelSubscription() {
    setBillingBusy("cancel");
    setBillingError("");
    try {
      await api.csrf();
      const result = await api.cancelBillingSubscription();
      setBilling(result.data);
      await refreshWorkspaceSession();
    } finally {
      setBillingBusy("");
    }
  }

  async function handleResumeSubscription() {
    setBillingBusy("resume");
    setBillingError("");
    try {
      await api.csrf();
      const result = await api.resumeBillingSubscription();
      setBilling(result.data);
      await refreshWorkspaceSession();
    } catch (err) {
      setBillingError(errorMessage(err));
    } finally {
      setBillingBusy("");
    }
  }

  async function handleCancelScheduledChange() {
    setBillingBusy("cancel-schedule");
    setBillingError("");
    try {
      await api.csrf();
      const result = await api.cancelScheduledBillingDowngrade();
      setBilling(result.data);
      await refreshWorkspaceSession();
    } catch (err) {
      setBillingError(errorMessage(err));
    } finally {
      setBillingBusy("");
    }
  }

  async function handleScheduleBillingChange(plan, interval) {
    setBillingBusy("schedule-change");
    setBillingError("");
    try {
      await api.csrf();
      const result = await api.scheduleBillingChange({ plan, interval });
      setBilling(result.data);
      await refreshWorkspaceSession();
    } finally {
      setBillingBusy("");
    }
  }

  async function handleCancelScheduledDowngrade() {
    setBillingBusy("cancel-downgrade");
    setBillingError("");
    try {
      await api.csrf();
      const result = await api.cancelScheduledBillingDowngrade();
      setBilling(result.data);
      await refreshWorkspaceSession();
    } catch (err) {
      setBillingError(errorMessage(err));
    } finally {
      setBillingBusy("");
    }
  }

  async function handleOpenPortal() {
    setBillingBusy("portal");
    setBillingError("");
    try {
      await api.csrf();
      await openStripePortalSafely(async () => {
        const result = await api.openBillingPortal();
        return result.data?.portal_url;
      });
    } catch (err) {
      setBillingError(errorMessage(err));
    } finally {
      setBillingBusy("");
    }
  }

  useEffect(() => {
    loadAccount();
  }, [loadAccount]);

  useEffect(() => {
    if (section !== "security") return undefined;
    const oauthProvider = searchParams.get("oauth");
    const oauthResult = searchParams.get("result");
    if (!oauthProvider || !oauthResult) return undefined;

    const message = oauthAccountSecurityResultMessage(oauthProvider, oauthResult);
    if (isOAuthVerifiedResult(oauthResult)) {
      setOauthReauthReady(true);
      setSignInMethodsNotice(message);
      setSignInMethodsError("");
      setDeleteOpen(true);
    } else if (oauthResult === "linked" || oauthResult === "already_linked") {
      setSignInMethodsNotice(message);
      setSignInMethodsError("");
      loadAccount();
    } else {
      setSignInMethodsError(message);
      setSignInMethodsNotice("");
    }
    setSignInMethodsExpanded(true);
    setSearchParams({}, { replace: true });
    return undefined;
  }, [section, searchParams, setSearchParams, loadAccount]);

  async function handleChangePassword(event) {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    setFieldErrors({});
    setSuccess("");
    try {
      await api.csrf();
      await api.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        new_password_confirm: newPasswordConfirm,
      });
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
      setSuccess(t("account:password.changed"));
    } catch (err) {
      const next = {
        current_password: fieldError(err, "current_password"),
        new_password: fieldError(err, "new_password"),
        new_password_confirm: fieldError(err, "new_password_confirm"),
      };
      if (next.current_password || next.new_password || next.new_password_confirm) {
        setFieldErrors(next);
      } else {
        setFormError(errorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  }

  async function handlePrimaryChange(event) {
    event.preventDefault();
    setPrimarySaving(true);
    setEmailError("");
    setEmailSuccess("");
    setPrimaryFieldErrors({});
    try {
      await api.csrf();
      await api.requestPrimaryEmailChange({
        email: primaryEmail,
        current_password: primaryPassword,
      });
      setPrimaryEmail("");
      setPrimaryPassword("");
      setPrimaryOpen(false);
      setEmailSuccess(t("account:emailMessages.verificationSentLogin"));
      await loadAccount();
    } catch (err) {
      const guidance = passwordNotAvailableGuidance(err);
      const next = {
        email: fieldError(err, "email"),
        current_password: guidance || fieldError(err, "current_password"),
      };
      if (next.email || next.current_password) {
        setPrimaryFieldErrors(next);
      } else {
        setEmailError(errorMessage(err));
      }
    } finally {
      setPrimarySaving(false);
    }
  }

  async function handleBackupRequest(event) {
    event.preventDefault();
    setBackupSaving(true);
    setEmailError("");
    setEmailSuccess("");
    setBackupFieldErrors({});
    try {
      await api.csrf();
      await api.requestBackupEmail({
        email: backupEmail,
        current_password: backupPassword,
      });
      setBackupEmail("");
      setBackupPassword("");
      setBackupOpen(false);
      setEmailSuccess(t("account:emailMessages.verificationSentBackup"));
      await loadAccount();
    } catch (err) {
      const guidance = passwordNotAvailableGuidance(err);
      const next = {
        email: fieldError(err, "email"),
        current_password: guidance || fieldError(err, "current_password"),
      };
      if (next.email || next.current_password) {
        setBackupFieldErrors(next);
      } else {
        setEmailError(errorMessage(err));
      }
    } finally {
      setBackupSaving(false);
    }
  }

  async function handleBackupRemove(event) {
    event.preventDefault();
    setBackupSaving(true);
    setEmailError("");
    setEmailSuccess("");
    setBackupFieldErrors({});
    try {
      await api.csrf();
      await api.removeBackupEmail({ current_password: backupRemovePassword });
      setBackupRemovePassword("");
      setBackupRemoveOpen(false);
      setEmailSuccess(t("account:emailMessages.backupRemoved"));
      await loadAccount();
    } catch (err) {
      const guidance = passwordNotAvailableGuidance(err);
      const message = guidance || fieldError(err, "current_password");
      if (message) {
        setBackupFieldErrors({ current_password: message });
      } else {
        setEmailError(errorMessage(err));
      }
    } finally {
      setBackupSaving(false);
    }
  }

  async function handleResendBackup() {
    setEmailError("");
    setEmailSuccess("");
    try {
      await api.csrf();
      await api.resendBackupEmailVerification();
      setEmailSuccess(t("account:emailMessages.verificationSent"));
    } catch (err) {
      setEmailError(errorMessage(err));
    }
  }

  async function handleCancelBackup() {
    setEmailError("");
    setEmailSuccess("");
    try {
      await api.csrf();
      await api.cancelBackupEmailChange();
      setEmailSuccess(t("account:emailMessages.pendingBackupCancelled"));
      await loadAccount();
    } catch (err) {
      setEmailError(errorMessage(err));
    }
  }

  async function handleResendPrimary() {
    setEmailError("");
    setEmailSuccess("");
    try {
      await api.csrf();
      await api.resendPrimaryEmailChange();
      setEmailSuccess(t("account:emailMessages.verificationSent"));
    } catch (err) {
      setEmailError(errorMessage(err));
    }
  }

  async function handleCancelPrimary() {
    setEmailError("");
    setEmailSuccess("");
    try {
      await api.csrf();
      await api.cancelPrimaryEmailChange();
      setEmailSuccess(t("account:emailMessages.pendingLoginCancelled"));
      await loadAccount();
    } catch (err) {
      setEmailError(errorMessage(err));
    }
  }

  async function handleDeleteAccount(event) {
    event.preventDefault();
    const confirmed = window.confirm(t("account:danger.confirmDialog"));
    if (!confirmed) return;
    setDeleting(true);
    setDeleteError("");
    setDeleteFieldErrors({});
    setDeleteSubscriptionBlocked(false);
    try {
      await api.csrf();
      const payload = {
        confirmation: deleteConfirmation,
      };
      if (Boolean(account?.sign_in_methods?.password?.enabled)) {
        payload.current_password = deletePassword;
      }
      if (account?.two_factor_status === "enabled") {
        if (deleteUseRecovery) {
          payload.recovery_code = deleteRecoveryCode;
        } else {
          payload.code = deleteCode;
        }
      }
      await api.deleteAccount(payload);
      if (onAccountDeleted) onAccountDeleted();
    } catch (err) {
      if (err?.data?.code === "active_subscription") {
        setDeleteSubscriptionBlocked(true);
        setDeleteError(err.data.detail || t("account:danger.activeSubscription"));
        return;
      }
      if (err?.data?.code === "oauth_reauth_required") {
        setDeleteError(err.data.detail || t("account:danger.oauthReauthRequired"));
        return;
      }
      const guidance = passwordNotAvailableGuidance(err);
      const next = {
        current_password: guidance || fieldError(err, "current_password"),
        confirmation: fieldError(err, "confirmation"),
        code: fieldError(err, "code"),
        recovery_code: fieldError(err, "recovery_code"),
      };
      if (Object.values(next).some(Boolean)) {
        setDeleteFieldErrors(next);
      } else {
        setDeleteError(errorMessage(err));
      }
    } finally {
      setDeleting(false);
    }
  }

  if (sectionParam && !isAccountSectionId(sectionParam, session)) {
    return <Navigate to="/account/security" replace />;
  }

  const sectionDescription = t(`accountSectionDescriptions.${section}`, {
    ns: "workspace",
    defaultValue: sectionMeta.description,
  });

  if (section === "subscription" || section === "billing" || section === "info" || section === "tutorial" || section === "status") {
    return (
      <div className="page account-page">
        <PageHeader title={t("workspace:pageTitles.account")} description={sectionDescription} />
        <AccountSubNav session={session} />
        {section === "subscription" ? (
          <AccountSubscriptionPanel
            session={subscriptionSession || session}
            billing={billing}
            billingLoading={billingLoading}
            billingError={billingError}
            confirmingCheckout={confirmingCheckout}
            checkoutNotice={checkoutNotice}
            busyAction={billingBusy}
            onStartCheckout={handleStartCheckout}
            onPreviewUpgrade={handlePreviewUpgrade}
            onConfirmUpgrade={handleConfirmUpgrade}
            onScheduleDowngrade={handleScheduleDowngrade}
            onCancelSubscription={handleCancelSubscription}
            onResumeSubscription={handleResumeSubscription}
            onCancelScheduledDowngrade={handleCancelScheduledDowngrade}
            onScheduleBillingChange={handleScheduleBillingChange}
            onCancelScheduledChange={handleCancelScheduledChange}
          />
        ) : null}
        {section === "billing" ? (
          <AccountBillingPanel
            billing={billing}
            billingLoading={billingLoading}
            billingError={billingError}
            portalNotice={portalNotice}
            invoices={billingInvoices}
            invoicesLoading={invoicesLoading}
            invoicesError={invoicesError}
            busyAction={billingBusy}
            onOpenPortal={handleOpenPortal}
          />
        ) : null}
        {section === "info" ? <AccountInfoPanel contentLang={workspaceContentLang} /> : null}
        {section === "tutorial" ? <AccountTutorialPanel /> : null}
        {section === "status" ? <AccountStatusPanel contentLang={workspaceContentLang} /> : null}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page">
        <LoadingState label={t("common:loading")} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <ErrorBanner message={error} />
      </div>
    );
  }

  const backupStatus = account.backup_email_status || "none";
  const passwordEnabled = Boolean(account.sign_in_methods?.password?.enabled);

  return (
    <div className="page account-page" data-tutorial-target="account-security">
      <PageHeader title={t("workspace:pageTitles.account")} description={sectionDescription} />
      <AccountSubNav session={session} />
      <div className="account-settings-stack">
        <AccountSettingsSection
          id="email"
          title={t("account:sections.email.title")}
          description={t("account:sections.email.description")}
          statusSummary={emailAccordionStatusSummary(account)}
          statusPills={emailAccordionStatusPills(account)}
          variant="email"
          isOpen={emailExpanded}
          onToggle={() => setEmailExpanded((open) => !open)}
        >
          <div className="account-email-section">
            <EmailActionRow
              label={t("account:email.loginEmail")}
              email={account.email}
              status={account.email_verified ? t("account:emailStatus.verified") : t("account:emailStatus.unverified")}
              statusVariant={account.email_verified ? "live" : undefined}
            >
              {!account.pending_primary_email && !primaryOpen ? (
                <button type="button" className="btn-secondary btn-sm" onClick={() => setPrimaryOpen(true)}>
                  {t("account:email.changeEmail")}
                </button>
              ) : null}
              {primaryOpen ? (
                <form className="auth-form account-inline-form" onSubmit={handlePrimaryChange} autoComplete="off">
                  <Field label={t("account:email.newLoginEmail")} error={primaryFieldErrors.email}>
                    <input
                      type="email"
                      value={primaryEmail}
                      onChange={(e) => setPrimaryEmail(e.target.value)}
                      required
                      autoComplete="email"
                    />
                  </Field>
                  <Field label={t("account:email.currentPassword")} error={primaryFieldErrors.current_password}>
                    <PasswordInput
                      value={primaryPassword}
                      onChange={(e) => setPrimaryPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      visible={emailPasswordVisibility.visible}
                      onVisibleChange={emailPasswordVisibility.setVisible}
                    />
                  </Field>
                  <div className="account-inline-actions">
                    <button type="submit" className="btn-primary" disabled={primarySaving}>
                      {primarySaving ? t("account:email.sending") : t("account:email.sendVerification")}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={primarySaving}
                      onClick={() => {
                        setPrimaryOpen(false);
                        setPrimaryEmail("");
                        setPrimaryPassword("");
                        setPrimaryFieldErrors({});
                      }}
                    >
                      {t("common:cancel")}
                    </button>
                  </div>
                </form>
              ) : null}
            </EmailActionRow>

            {account.pending_primary_email ? (
              <EmailActionRow
                label={t("account:email.pendingChange")}
                email={account.pending_primary_email}
                status={t("account:emailStatus.pendingVerification")}
              >
                <div className="account-inline-actions">
                  <button type="button" className="btn-secondary btn-sm" onClick={handleResendPrimary}>
                    {t("account:email.resendVerification")}
                  </button>
                  <button type="button" className="btn-secondary btn-sm" onClick={handleCancelPrimary}>
                    {t("account:email.cancelChange")}
                  </button>
                </div>
              </EmailActionRow>
            ) : null}

            <EmailActionRow
              label={t("account:email.backupEmail")}
              email={
                backupStatus === "pending"
                  ? account.pending_backup_email
                  : backupStatus === "verified"
                    ? account.backup_email
                    : null
              }
              status={
                backupStatus === "pending"
                  ? t("account:emailStatus.pendingVerification")
                  : backupStatus === "verified"
                    ? t("account:emailStatus.verified")
                    : null
              }
              statusVariant={backupStatus === "verified" ? "live" : undefined}
              hint={t("account:email.backupEmailHint")}
            >
              {backupStatus === "none" && !backupOpen ? (
                <button type="button" className="btn-secondary btn-sm" onClick={() => setBackupOpen(true)}>
                  {t("account:email.addBackupEmail")}
                </button>
              ) : null}
              {backupStatus === "verified" && !backupOpen && !backupRemoveOpen ? (
                <div className="account-inline-actions">
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setBackupOpen(true)}>
                    {t("account:email.change")}
                  </button>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setBackupRemoveOpen(true)}>
                    {t("account:email.remove")}
                  </button>
                </div>
              ) : null}
              {backupStatus === "pending" ? (
                <div className="account-inline-actions">
                  <button type="button" className="btn-secondary btn-sm" onClick={handleResendBackup}>
                    {t("account:email.resendVerification")}
                  </button>
                  <button type="button" className="btn-secondary btn-sm" onClick={handleCancelBackup}>
                    {t("account:email.cancelPendingChange")}
                  </button>
                </div>
              ) : null}
              {backupOpen ? (
                <form className="auth-form account-inline-form" onSubmit={handleBackupRequest} autoComplete="off">
                  <Field label={t("account:email.backupEmail")} error={backupFieldErrors.email}>
                    <input
                      type="email"
                      value={backupEmail}
                      onChange={(e) => setBackupEmail(e.target.value)}
                      required
                      autoComplete="email"
                    />
                  </Field>
                  <Field label={t("account:email.currentPassword")} error={backupFieldErrors.current_password}>
                    <PasswordInput
                      value={backupPassword}
                      onChange={(e) => setBackupPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      visible={emailPasswordVisibility.visible}
                      onVisibleChange={emailPasswordVisibility.setVisible}
                    />
                  </Field>
                  <div className="account-inline-actions">
                    <button type="submit" className="btn-primary" disabled={backupSaving}>
                      {backupSaving ? t("account:email.sending") : t("account:email.sendVerification")}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={backupSaving}
                      onClick={() => {
                        setBackupOpen(false);
                        setBackupEmail("");
                        setBackupPassword("");
                        setBackupFieldErrors({});
                      }}
                    >
                      {t("common:cancel")}
                    </button>
                  </div>
                </form>
              ) : null}
              {backupRemoveOpen ? (
                <form className="auth-form account-inline-form" onSubmit={handleBackupRemove} autoComplete="off">
                  <Field label={t("account:email.currentPassword")} error={backupFieldErrors.current_password}>
                    <PasswordInput
                      value={backupRemovePassword}
                      onChange={(e) => setBackupRemovePassword(e.target.value)}
                      required
                      autoComplete="current-password"
                    />
                  </Field>
                  <div className="account-inline-actions">
                    <button type="submit" className="btn-danger" disabled={backupSaving}>
                      {backupSaving ? t("account:email.removing") : t("account:email.removeBackupEmail")}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={backupSaving}
                      onClick={() => {
                        setBackupRemoveOpen(false);
                        setBackupRemovePassword("");
                        setBackupFieldErrors({});
                      }}
                    >
                      {t("common:cancel")}
                    </button>
                  </div>
                </form>
              ) : null}
            </EmailActionRow>
          </div>
          <p className="hint">{t("account:email.staffHint")}</p>
          <ErrorBanner message={emailError} />
          <SuccessBanner message={emailSuccess} />
        </AccountSettingsSection>

        <AccountSettingsSection
          id="sign-in-methods"
          title={t("account:sections.signInMethods.title")}
          description={t("account:sections.signInMethods.description")}
          statusSummary={signInMethodsStatusSummary(account.sign_in_methods)}
          statusPills={signInMethodsStatusPills(account.sign_in_methods)}
          variant="signInMethods"
          isOpen={signInMethodsExpanded}
          onToggle={() => setSignInMethodsExpanded((open) => !open)}
        >
          <AccountSignInMethodsPanel
            account={account}
            twoFactorEnabled={account?.two_factor_status === "enabled"}
            oauthReauthReady={oauthReauthReady}
            onOpenChangePassword={() => {
              setPasswordExpanded(true);
              setSignInMethodsExpanded(false);
            }}
            onRefreshAccount={async (nextAccount) => {
              setAccount(nextAccount || (await api.account()).data);
              setOauthReauthReady(false);
              setSignInMethodsNotice("");
            }}
          />
          <ErrorBanner message={signInMethodsError} />
          <SuccessBanner message={signInMethodsNotice} />
        </AccountSettingsSection>

        {passwordEnabled ? (
        <AccountSettingsSection
          id="password"
          title={t("account:sections.password.title")}
          description={t("account:sections.password.description")}
          variant="password"
          isOpen={passwordExpanded}
          onToggle={() => setPasswordExpanded((open) => !open)}
        >
          <form className="auth-form" onSubmit={handleChangePassword} autoComplete="off">
            <Field label={t("account:password.current")} error={fieldErrors.current_password}>
              <PasswordInput
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </Field>
            <Field label={t("account:password.new")} error={fieldErrors.new_password}>
              <PasswordInput
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoComplete="new-password"
                visible={newPasswordVisibility.visible}
                onVisibleChange={newPasswordVisibility.setVisible}
              />
            </Field>
            <Field label={t("account:password.confirmNew")} error={fieldErrors.new_password_confirm}>
              <PasswordInput
                value={newPasswordConfirm}
                onChange={(e) => setNewPasswordConfirm(e.target.value)}
                required
                autoComplete="new-password"
                visible={newPasswordVisibility.visible}
                showToggle={false}
              />
            </Field>
            <ErrorBanner message={formError} />
            <SuccessBanner message={success} />
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? t("account:password.saving") : t("account:password.update")}
            </button>
          </form>
        </AccountSettingsSection>
        ) : null}

        <AccountSettingsSection
          id="two-factor"
          title={t("account:sections.twoFactor.title")}
          description={t("account:sections.twoFactor.description")}
          statusPills={twoFactorStatusPills(account?.two_factor_status)}
          variant="twoFactor"
          isOpen={twoFactorExpanded}
          onToggle={() => {
            setTwoFactorExpanded((open) => !open);
            // Closing the panel should also dismiss any in-progress subflow.
            if (twoFactorExpanded) setTwoFactorAction(null);
          }}
        >
          {account?.two_factor_status === "enabled" ? (
            <div className="account-page-two-factor">
              {twoFactorAction === null ? (
                <>
                  <p className="account-settings-note">
                    <strong>{t("account:twoFactor.statusEnabled")}</strong>
                  </p>
                  <div style={{ display: "grid", gap: "0.75rem" }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        setTwoFactorAction("regen");
                        setRegenPassword("");
                        setRegenError("");
                        setRegenUseRecoveryCode(false);
                        setRegenCode("");
                        setRegenRecoveryCode("");
                        setRegenRecoveryCodes(null);
                      }}
                    >
                      {t("account:twoFactor.regenerateCodes")}
                    </button>
                    <button
                      type="button"
                      className="btn-danger-soft"
                      onClick={() => {
                        setTwoFactorAction("disable");
                        setDisablePassword("");
                        setDisableError("");
                        setDisableUseRecoveryCode(false);
                        setDisableCode("");
                        setDisableRecoveryCode("");
                      }}
                    >
                      {t("account:twoFactor.disable")}
                    </button>
                  </div>
                </>
              ) : null}

              {twoFactorAction === "regen" ? (
                <form
                  className="auth-form"
                  autoComplete="off"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    setRegenBusy(true);
                    setRegenError("");
                    setRegenRecoveryCodes(null);
                    try {
                      await api.csrf();
                      const payload = {
                        current_password: regenPassword,
                        ...(regenUseRecoveryCode
                          ? { recovery_code: regenRecoveryCode }
                          : { code: regenCode }),
                      };
                      const result = await api.owner2faRegenerateRecoveryCodes(payload);
                      setRegenRecoveryCodes(result.data.recovery_codes || result.data.recoveryCodes || []);
                    } catch (err) {
                      setRegenError(sensitiveActionErrorMessage(err));
                    } finally {
                      setRegenBusy(false);
                    }
                  }}
                >
                  <h4 style={{ margin: 0, fontWeight: 700 }}>{t("account:twoFactor.regenerateTitle")}</h4>
                  <Field label={t("account:password.current")} error={regenError}>
                    <PasswordInput value={regenPassword} onChange={(e) => setRegenPassword(e.target.value)} required autoComplete="current-password" />
                  </Field>

                  <div style={{ display: "grid", gap: "0.75rem" }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        setRegenUseRecoveryCode((v) => !v);
                        setRegenCode("");
                        setRegenRecoveryCode("");
                      }}
                    >
                      {regenUseRecoveryCode ? t("account:twoFactor.useAuthenticator") : t("account:twoFactor.useRecovery")}
                    </button>

                    {!regenUseRecoveryCode ? (
                      <Field label={t("account:twoFactor.authenticatorCode")}>
                        <input
                          value={regenCode}
                          onChange={(e) => setRegenCode(e.target.value)}
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          required
                        />
                      </Field>
                    ) : (
                      <Field label={t("account:twoFactor.recoveryCode")}>
                        <input
                          value={regenRecoveryCode}
                          onChange={(e) => setRegenRecoveryCode(e.target.value)}
                          type="text"
                          autoComplete="one-time-code"
                          required
                          placeholder={t("account:twoFactor.recoveryPlaceholder")}
                        />
                      </Field>
                    )}
                  </div>

                  <ErrorBanner message={regenError} />
                  <SuccessBanner message="" />

                  {regenRecoveryCodes ? (
                    <div className="auth-status-panel">
                      <p className="account-settings-note">
                        {t("account:twoFactor.recoveryOnce")}
                      </p>
                      <div style={{ display: "grid", gap: "0.4rem" }}>
                        {regenRecoveryCodes.map((c) => (
                          <CodeBadge key={c}>{c}</CodeBadge>
                        ))}
                      </div>
                      <div style={{ display: "grid", gap: "0.75rem", marginTop: "1rem" }}>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => {
                            setRegenRecoveryCodes(null);
                            setTwoFactorAction(null);
                          }}
                        >
                          {t("account:twoFactor.done")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="submit" className="btn-primary" disabled={regenBusy}>
                      {regenBusy ? t("common:working") : t("account:twoFactor.regenerate")}
                    </button>
                  )}
                </form>
              ) : null}

              {twoFactorAction === "disable" ? (
                <form
                  className="auth-form"
                  autoComplete="off"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    setDisableBusy(true);
                    setDisableError("");
                    try {
                      await api.csrf();
                      const payload = {
                        current_password: disablePassword,
                        ...(disableUseRecoveryCode ? { recovery_code: disableRecoveryCode } : { code: disableCode }),
                      };
                      await api.owner2faDisable(payload);
                      setTwoFactorExpanded(false);
                      setTwoFactorAction(null);
                      await loadAccount();
                    } catch (err) {
                      setDisableError(sensitiveActionErrorMessage(err));
                    } finally {
                      setDisableBusy(false);
                    }
                  }}
                >
                  <h4 style={{ margin: 0, fontWeight: 700 }}>{t("account:twoFactor.disableTitle")}</h4>
                  <Field label={t("account:password.current")}>
                    <PasswordInput value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} required autoComplete="current-password" />
                  </Field>

                  <div style={{ display: "grid", gap: "0.75rem" }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        setDisableUseRecoveryCode((v) => !v);
                        setDisableCode("");
                        setDisableRecoveryCode("");
                      }}
                    >
                      {disableUseRecoveryCode ? t("account:twoFactor.useAuthenticator") : t("account:twoFactor.useRecovery")}
                    </button>

                    {!disableUseRecoveryCode ? (
                      <Field label={t("account:twoFactor.authenticatorCode")}>
                        <input value={disableCode} onChange={(e) => setDisableCode(e.target.value)} type="text" inputMode="numeric" autoComplete="one-time-code" required />
                      </Field>
                    ) : (
                      <Field label={t("account:twoFactor.recoveryCode")}>
                        <input value={disableRecoveryCode} onChange={(e) => setDisableRecoveryCode(e.target.value)} type="text" autoComplete="one-time-code" required placeholder={t("account:twoFactor.recoveryPlaceholder")} />
                      </Field>
                    )}
                  </div>

                  <ErrorBanner message={disableError} />
                  <button type="submit" className="btn-danger-soft" disabled={disableBusy}>
                    {disableBusy ? t("common:working") : t("account:twoFactor.disable")}
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}

          {account?.two_factor_status !== "enabled" ? (
            <div className="account-page-two-factor">
              {twoFactorAction === null ? (
                <>
                  <p className="account-settings-note">
                    <strong>{t("account:twoFactor.notEnabledTitle")}</strong>
                  </p>
                  <p className="account-settings-note">
                    {t("account:twoFactor.notEnabledDescription")}
                  </p>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      setTwoFactorAction("setup");
                      setSetupStep("password");
                      setSetupPassword("");
                      setSetupError("");
                      setSetupQrDataUri("");
                      setSetupKey("");
                      setSetupCode("");
                      setSetupRecoveryCodes(null);
                    }}
                  >
                    {t("account:twoFactor.setup")}
                  </button>
                </>
              ) : null}

              {twoFactorAction === "setup" ? (
                <div className="auth-form">
                  {setupStep === "password" ? (
                    <form
                      onSubmit={async (event) => {
                        event.preventDefault();
                        setSetupBusy(true);
                        setSetupError("");
                        setSetupQrDataUri("");
                        setSetupKey("");
                        setSetupCode("");
                        setSetupRecoveryCodes(null);
                        try {
                          await api.csrf();
                          const result = await api.owner2faStartSetup({ current_password: setupPassword });
                          setSetupQrDataUri(result.data.qr_data_uri);
                          setSetupKey(result.data.setup_key);
                          setSetupStep("verifying");
                        } catch (err) {
                          setSetupError(sensitiveActionErrorMessage(err));
                        } finally {
                          setSetupBusy(false);
                        }
                      }}
                    >
                      <Field label={t("account:password.current")} error={setupError}>
                        <PasswordInput value={setupPassword} onChange={(e) => setSetupPassword(e.target.value)} required autoComplete="current-password" />
                      </Field>
                      <ErrorBanner message={setupError} />
                      <button type="submit" className="btn-primary" disabled={setupBusy}>
                        {setupBusy ? t("common:working") : t("account:twoFactor.continue")}
                      </button>
                    </form>
                  ) : null}

                  {setupStep === "verifying" ? (
                    <form
                      autoComplete="off"
                      onSubmit={async (event) => {
                        event.preventDefault();
                        setSetupBusy(true);
                        setSetupError("");
                        try {
                          await api.csrf();
                          const result = await api.owner2faVerifySetup({ code: setupCode });
                          setSetupRecoveryCodes(result.data.recovery_codes || result.data.recoveryCodes || []);
                        } catch (err) {
                          setSetupError(sensitiveActionErrorMessage(err));
                        } finally {
                          setSetupBusy(false);
                        }
                      }}
                    >
                      {setupRecoveryCodes ? (
                        <div className="auth-status-panel">
                          <p className="account-settings-note">
                            {t("account:twoFactor.recoveryOnce")}
                          </p>
                          <div style={{ display: "grid", gap: "0.4rem" }}>
                            {setupRecoveryCodes.map((c) => (
                              <CodeBadge key={c}>{c}</CodeBadge>
                            ))}
                          </div>
                          <div style={{ display: "grid", gap: "0.75rem", marginTop: "1rem" }}>
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={async () => {
                                setTwoFactorExpanded(false);
                                setTwoFactorAction(null);
                                setSetupRecoveryCodes(null);
                                setSetupStep("password");
                                await loadAccount();
                              }}
                            >
                              {t("account:twoFactor.done")}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: "grid", gap: "0.75rem" }}>
                            {setupQrDataUri ? (
                              <div style={{ display: "grid", gap: "0.35rem", justifyItems: "start" }}>
                                <p className="account-settings-note">
                                  {t("account:twoFactor.scanQr")}
                                </p>
                                <img src={setupQrDataUri} alt={t("account:twoFactor.qrAlt")} style={{ width: 160, height: 160 }} />
                              </div>
                            ) : null}

                            {setupKey ? (
                              <div style={{ display: "grid", gap: "0.35rem" }}>
                                <p className="account-settings-note">{t("account:twoFactor.manualKey")}</p>
                                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                                  <CodeBadge>{setupKey}</CodeBadge>
                                  <CopyButton value={setupKey} label={t("account:twoFactor.copyKey")} />
                                </div>
                              </div>
                            ) : null}

                            <Field label={t("account:twoFactor.authenticatorCode")} error={setupError}>
                              <input
                                value={setupCode}
                                onChange={(e) => setSetupCode(e.target.value)}
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                required
                                placeholder={t("account:twoFactor.codePlaceholder")}
                              />
                            </Field>
                            <ErrorBanner message={setupError} />
                          </div>

                          <button type="submit" className="btn-primary" disabled={setupBusy}>
                            {setupBusy ? t("account:twoFactor.verifying") : t("account:twoFactor.verifyEnable")}
                          </button>
                          <button
                            type="button"
                            className="btn-secondary"
                            onClick={() => {
                              // Supersede pending setup with a fresh QR + secret.
                              setSetupStep("password");
                              setSetupQrDataUri("");
                              setSetupKey("");
                              setSetupCode("");
                              setSetupRecoveryCodes(null);
                            }}
                          >
                            {t("account:twoFactor.restartSetup")}
                          </button>
                        </>
                      )}
                    </form>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </AccountSettingsSection>

        <AccountSettingsSection
          id="danger"
          title={t("account:sections.danger.title")}
          description={t("account:sections.danger.description")}
          variant="danger"
        >
          {!deleteOpen ? (
            <div className="danger-zone">
              <p>{t("account:danger.intro")}</p>
              <button type="button" className="btn-danger btn-sm" onClick={() => setDeleteOpen(true)}>
                {t("account:danger.deleteAccount")}
              </button>
            </div>
          ) : (
            <form className="auth-form danger-zone-form" onSubmit={handleDeleteAccount} autoComplete="off">
              <div className="danger-zone-warning">
                <p>
                  <strong>{t("account:danger.confirmTitle")}</strong> {t("account:danger.confirmBody1")}
                </p>
                <p>{t("account:danger.confirmBody2")}</p>
                <p>{t("account:danger.confirmBody3")}</p>
              </div>
              {deleteSubscriptionBlocked ? (
                <div className="danger-zone-warning" role="alert">
                  <p>{t("account:danger.activeSubscription")}</p>
                  <p>{t("account:danger.activeSubscriptionHint")}</p>
                  {canManageSubscription(session) ? (
                    <p>
                      <Link className="btn-secondary btn-sm" to="/account/subscription">
                        {t("account:danger.manageSubscription")}
                      </Link>
                    </p>
                  ) : null}
                </div>
              ) : null}
              {passwordEnabled ? (
                <Field label={t("account:password.current")} error={deleteFieldErrors.current_password}>
                  <PasswordInput
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </Field>
              ) : (
                <div className="account-inline-actions">
                  <p className="hint">{t("account:danger.oauthReauthRequired")}</p>
                  {oauthReauthReady ? (
                    <p className="hint">{t("account:danger.oauthReauthReady")}</p>
                  ) : (
                    <>
                      {account?.sign_in_methods?.google?.linked ? (
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => {
                            window.location.assign(oauthStartUrl(api.baseUrl, "google", "verify"));
                          }}
                        >
                          {t("account:signInMethods.confirmWithGoogle")}
                        </button>
                      ) : null}
                      {account?.sign_in_methods?.apple?.linked ? (
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => {
                            window.location.assign(oauthStartUrl(api.baseUrl, "apple", "verify"));
                          }}
                        >
                          {t("account:signInMethods.confirmWithApple")}
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              )}
              {account?.two_factor_status === "enabled" ? (
                <>
                  <Field
                    label={
                      deleteUseRecovery
                        ? t("account:twoFactor.recoveryCode")
                        : t("account:signInMethods.authCode")
                    }
                    error={deleteFieldErrors.code || deleteFieldErrors.recovery_code}
                  >
                    {deleteUseRecovery ? (
                      <input
                        type="text"
                        value={deleteRecoveryCode}
                        onChange={(e) => setDeleteRecoveryCode(e.target.value)}
                        required
                        autoComplete="off"
                      />
                    ) : (
                      <input
                        type="text"
                        inputMode="numeric"
                        value={deleteCode}
                        onChange={(e) => setDeleteCode(e.target.value)}
                        required
                        autoComplete="one-time-code"
                      />
                    )}
                  </Field>
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => setDeleteUseRecovery((value) => !value)}
                  >
                    {deleteUseRecovery
                      ? t("account:twoFactor.useAuthenticator")
                      : t("account:twoFactor.useRecovery")}
                  </button>
                </>
              ) : null}
              <Field
                label={t("account:danger.confirmPrompt")}
                error={deleteFieldErrors.confirmation}
              >
                <input
                  type="text"
                  value={deleteConfirmation}
                  onChange={(e) => setDeleteConfirmation(e.target.value)}
                  required
                  autoComplete="off"
                />
              </Field>
              <ErrorBanner message={deleteError} />
              <div className="danger-zone-actions">
                <button
                  type="submit"
                  className="btn-danger"
                  disabled={
                    deleting
                    || deleteSubscriptionBlocked
                    || (!passwordEnabled && !oauthReauthReady)
                  }
                >
                  {deleting ? t("account:danger.deleting") : t("account:danger.permanentlyDelete")}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={deleting}
                  onClick={() => {
                    setDeleteOpen(false);
                    setDeletePassword("");
                    setDeleteConfirmation("");
                    setDeleteError("");
                    setDeleteFieldErrors({});
                    setDeleteCode("");
                    setDeleteRecoveryCode("");
                    setDeleteUseRecovery(false);
                    setDeleteSubscriptionBlocked(false);
                  }}
                >
                  {t("common:cancel")}
                </button>
              </div>
            </form>
          )}
        </AccountSettingsSection>
      </div>
    </div>
  );
}
