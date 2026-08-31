import { useCallback, useEffect, useState } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";
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

function EmailActionRow({ label, email, status, children }) {
  return (
    <div className="account-email-block">
      <div className="account-email-row">
        <div>
          <p className="account-email-label">{label}</p>
          {email ? <strong>{email}</strong> : <span className="hint">Not added</span>}
        </div>
        {status ? <Badge variant={status === "Verified" ? "live" : undefined}>{status}</Badge> : null}
      </div>
      {children}
    </div>
  );
}

export default function AccountScreen({ session, setSession, onAccountDeleted }) {
  const { section: sectionParam } = useParams();
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
        setCheckoutNotice("Checkout was cancelled. Your plan was not changed.");
        setSearchParams({}, { replace: true });
        return;
      }
      if (portal === "return") {
        setPortalNotice("Returned from Stripe Customer Portal. Refreshing billing state…");
        await refreshWorkspaceSession();
        if (cancelled) return;
        await loadBilling();
        if (cancelled) return;
        setPortalNotice("Billing state refreshed from the server.");
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
                ? "Subscription confirmed from Stripe."
                : "Still confirming with Stripe. Refresh this page in a moment if your plan has not updated.",
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
      if (!url) throw { data: { detail: "Checkout URL was not returned." } };
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
      setSuccess("Password changed.");
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
      setEmailSuccess("Verification email sent to your new login email address.");
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
      setEmailSuccess("Verification email sent to your backup email address.");
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
      setEmailSuccess("Backup email removed.");
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
      setEmailSuccess("Verification email sent.");
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
      setEmailSuccess("Pending backup email change cancelled.");
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
      setEmailSuccess("Verification email sent.");
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
      setEmailSuccess("Pending login email change cancelled.");
      await loadAccount();
    } catch (err) {
      setEmailError(errorMessage(err));
    }
  }

  async function handleDeleteAccount(event) {
    event.preventDefault();
    const confirmed = window.confirm(
      "This cannot be undone. Permanently delete your CheckStation account and workspace?"
    );
    if (!confirmed) return;
    setDeleting(true);
    setDeleteError("");
    setDeleteFieldErrors({});
    try {
      await api.csrf();
      await api.deleteAccount({
        current_password: deletePassword,
        confirmation: deleteConfirmation,
      });
      if (onAccountDeleted) onAccountDeleted();
    } catch (err) {
      const guidance = passwordNotAvailableGuidance(err);
      const next = {
        current_password: guidance || fieldError(err, "current_password"),
        confirmation: fieldError(err, "confirmation"),
      };
      if (next.current_password || next.confirmation) {
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

  if (section === "subscription" || section === "billing" || section === "info" || section === "tutorial" || section === "status") {
    return (
      <div className="page account-page">
        <PageHeader title="Account" description={sectionMeta.description} />
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
        {section === "info" ? <AccountInfoPanel /> : null}
        {section === "tutorial" ? <AccountTutorialPanel /> : null}
        {section === "status" ? <AccountStatusPanel /> : null}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page">
        <LoadingState label="Loading account…" />
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
      <PageHeader title="Account" description={sectionMeta.description} />
      <AccountSubNav session={session} />
      <div className="account-settings-stack">
        <AccountSettingsSection
          id="email"
          title="Email"
          description="Login and backup email settings"
          statusSummary={emailAccordionStatusSummary(account)}
          statusPills={emailAccordionStatusPills(account)}
          variant="email"
          isOpen={emailExpanded}
          onToggle={() => setEmailExpanded((open) => !open)}
        >
          <div className="account-email-section">
            <EmailActionRow
              label="Login email"
              email={account.email}
              status={account.email_verified ? "Verified" : "Unverified"}
            >
              {!account.pending_primary_email && !primaryOpen ? (
                <button type="button" className="btn-secondary btn-sm" onClick={() => setPrimaryOpen(true)}>
                  Change email
                </button>
              ) : null}
              {primaryOpen ? (
                <form className="auth-form account-inline-form" onSubmit={handlePrimaryChange} autoComplete="off">
                  <Field label="New login email" error={primaryFieldErrors.email}>
                    <input
                      type="email"
                      value={primaryEmail}
                      onChange={(e) => setPrimaryEmail(e.target.value)}
                      required
                      autoComplete="email"
                    />
                  </Field>
                  <Field label="Current password" error={primaryFieldErrors.current_password}>
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
                      {primarySaving ? "Sending…" : "Send verification email"}
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
                      Cancel
                    </button>
                  </div>
                </form>
              ) : null}
            </EmailActionRow>

            {account.pending_primary_email ? (
              <EmailActionRow
                label="Pending change"
                email={account.pending_primary_email}
                status="Pending verification"
              >
                <div className="account-inline-actions">
                  <button type="button" className="btn-secondary btn-sm" onClick={handleResendPrimary}>
                    Resend verification
                  </button>
                  <button type="button" className="btn-secondary btn-sm" onClick={handleCancelPrimary}>
                    Cancel change
                  </button>
                </div>
              </EmailActionRow>
            ) : null}

            <EmailActionRow
              label="Backup email"
              email={
                backupStatus === "pending"
                  ? account.pending_backup_email
                  : backupStatus === "verified"
                    ? account.backup_email
                    : null
              }
              status={
                backupStatus === "pending"
                  ? "Pending verification"
                  : backupStatus === "verified"
                    ? "Verified"
                    : null
              }
            >
              {backupStatus === "none" && !backupOpen ? (
                <button type="button" className="btn-secondary btn-sm" onClick={() => setBackupOpen(true)}>
                  Add backup email
                </button>
              ) : null}
              {backupStatus === "verified" && !backupOpen && !backupRemoveOpen ? (
                <div className="account-inline-actions">
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setBackupOpen(true)}>
                    Change
                  </button>
                  <button type="button" className="btn-secondary btn-sm" onClick={() => setBackupRemoveOpen(true)}>
                    Remove
                  </button>
                </div>
              ) : null}
              {backupStatus === "pending" ? (
                <div className="account-inline-actions">
                  <button type="button" className="btn-secondary btn-sm" onClick={handleResendBackup}>
                    Resend verification
                  </button>
                  <button type="button" className="btn-secondary btn-sm" onClick={handleCancelBackup}>
                    Cancel pending change
                  </button>
                </div>
              ) : null}
              {backupOpen ? (
                <form className="auth-form account-inline-form" onSubmit={handleBackupRequest} autoComplete="off">
                  <Field label="Backup email" error={backupFieldErrors.email}>
                    <input
                      type="email"
                      value={backupEmail}
                      onChange={(e) => setBackupEmail(e.target.value)}
                      required
                      autoComplete="email"
                    />
                  </Field>
                  <Field label="Current password" error={backupFieldErrors.current_password}>
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
                      {backupSaving ? "Sending…" : "Send verification email"}
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
                      Cancel
                    </button>
                  </div>
                </form>
              ) : null}
              {backupRemoveOpen ? (
                <form className="auth-form account-inline-form" onSubmit={handleBackupRemove} autoComplete="off">
                  <Field label="Current password" error={backupFieldErrors.current_password}>
                    <PasswordInput
                      value={backupRemovePassword}
                      onChange={(e) => setBackupRemovePassword(e.target.value)}
                      required
                      autoComplete="current-password"
                    />
                  </Field>
                  <div className="account-inline-actions">
                    <button type="submit" className="btn-danger" disabled={backupSaving}>
                      {backupSaving ? "Removing…" : "Remove backup email"}
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
                      Cancel
                    </button>
                  </div>
                </form>
              ) : null}
            </EmailActionRow>
          </div>
          <p className="hint">Workspace staff accounts use a separate login and are not verified here.</p>
          <ErrorBanner message={emailError} />
          <SuccessBanner message={emailSuccess} />
        </AccountSettingsSection>

        <AccountSettingsSection
          id="sign-in-methods"
          title="Sign-in methods"
          description="Password, Google, and Apple sign-in options"
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
          title="Change password"
          description="Update your account password"
          variant="password"
          isOpen={passwordExpanded}
          onToggle={() => setPasswordExpanded((open) => !open)}
        >
          <form className="auth-form" onSubmit={handleChangePassword} autoComplete="off">
            <Field label="Current password" error={fieldErrors.current_password}>
              <PasswordInput
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </Field>
            <Field label="New password" error={fieldErrors.new_password}>
              <PasswordInput
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoComplete="new-password"
                visible={newPasswordVisibility.visible}
                onVisibleChange={newPasswordVisibility.setVisible}
              />
            </Field>
            <Field label="Confirm new password" error={fieldErrors.new_password_confirm}>
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
              {saving ? "Saving…" : "Update password"}
            </button>
          </form>
        </AccountSettingsSection>
        ) : null}

        <AccountSettingsSection
          id="two-factor"
          title="Two-factor authentication"
          description="Add an extra security step when signing in."
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
                    <strong>Status: Enabled</strong>
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
                      Regenerate recovery codes
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
                      Disable two-factor authentication
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
                  <h4 style={{ margin: 0, fontWeight: 700 }}>Regenerate recovery codes</h4>
                  <Field label="Current password" error={regenError}>
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
                      {regenUseRecoveryCode ? "Use authenticator code" : "Use a recovery code"}
                    </button>

                    {!regenUseRecoveryCode ? (
                      <Field label="Authenticator code">
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
                      <Field label="Recovery code">
                        <input
                          value={regenRecoveryCode}
                          onChange={(e) => setRegenRecoveryCode(e.target.value)}
                          type="text"
                          autoComplete="one-time-code"
                          required
                          placeholder="e.g. ABCD-EFGH"
                        />
                      </Field>
                    )}
                  </div>

                  <ErrorBanner message={regenError} />
                  <SuccessBanner message="" />

                  {regenRecoveryCodes ? (
                    <div className="auth-status-panel">
                      <p className="account-settings-note">
                        Recovery codes are shown once. Save them somewhere safe.
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
                          Done
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="submit" className="btn-primary" disabled={regenBusy}>
                      {regenBusy ? "Working…" : "Regenerate"}
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
                  <h4 style={{ margin: 0, fontWeight: 700 }}>Disable two-factor authentication</h4>
                  <Field label="Current password">
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
                      {disableUseRecoveryCode ? "Use authenticator code" : "Use a recovery code"}
                    </button>

                    {!disableUseRecoveryCode ? (
                      <Field label="Authenticator code">
                        <input value={disableCode} onChange={(e) => setDisableCode(e.target.value)} type="text" inputMode="numeric" autoComplete="one-time-code" required />
                      </Field>
                    ) : (
                      <Field label="Recovery code">
                        <input value={disableRecoveryCode} onChange={(e) => setDisableRecoveryCode(e.target.value)} type="text" autoComplete="one-time-code" required placeholder="e.g. ABCD-EFGH" />
                      </Field>
                    )}
                  </div>

                  <ErrorBanner message={disableError} />
                  <button type="submit" className="btn-danger-soft" disabled={disableBusy}>
                    {disableBusy ? "Working…" : "Disable two-factor authentication"}
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
                    <strong>Two-factor authentication is not enabled.</strong>
                  </p>
                  <p className="account-settings-note">
                    Protect your workspace with an authenticator app, even if your password is compromised.
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
                    Set up two-factor authentication
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
                      <Field label="Current password" error={setupError}>
                        <PasswordInput value={setupPassword} onChange={(e) => setSetupPassword(e.target.value)} required autoComplete="current-password" />
                      </Field>
                      <ErrorBanner message={setupError} />
                      <button type="submit" className="btn-primary" disabled={setupBusy}>
                        {setupBusy ? "Working…" : "Continue"}
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
                            Recovery codes are shown once. Save them somewhere safe.
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
                              Done
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: "grid", gap: "0.75rem" }}>
                            {setupQrDataUri ? (
                              <div style={{ display: "grid", gap: "0.35rem", justifyItems: "start" }}>
                                <p className="account-settings-note">
                                  Scan this QR code with your authenticator app:
                                </p>
                                <img src={setupQrDataUri} alt="Authenticator QR code" style={{ width: 160, height: 160 }} />
                              </div>
                            ) : null}

                            {setupKey ? (
                              <div style={{ display: "grid", gap: "0.35rem" }}>
                                <p className="account-settings-note">Manual setup key:</p>
                                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                                  <CodeBadge>{setupKey}</CodeBadge>
                                  <CopyButton value={setupKey} label="Copy key" />
                                </div>
                              </div>
                            ) : null}

                            <Field label="Authenticator code" error={setupError}>
                              <input
                                value={setupCode}
                                onChange={(e) => setSetupCode(e.target.value)}
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                required
                                placeholder="6-digit code"
                              />
                            </Field>
                            <ErrorBanner message={setupError} />
                          </div>

                          <button type="submit" className="btn-primary" disabled={setupBusy}>
                            {setupBusy ? "Verifying…" : "Verify & enable"}
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
                            Restart setup
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
          title="Danger zone"
          description="Permanent account deletion is separate from logout and archiving."
          variant="danger"
        >
          {!deleteOpen ? (
            <div className="danger-zone">
              <p>
                Permanently delete your CheckStation account, this workspace, and
                customer-created operational data. This cannot be undone.
              </p>
              <button type="button" className="btn-danger btn-sm" onClick={() => setDeleteOpen(true)}>
                Delete account
              </button>
            </div>
          ) : (
            <form className="auth-form danger-zone-form" onSubmit={handleDeleteAccount} autoComplete="off">
              <div className="danger-zone-warning">
                <p>
                  <strong>This cannot be undone.</strong> Permanent deletion removes
                  your CheckStation account, this workspace, and customer-created
                  operational data such as Members, Groups, kiosk configuration,
                  staff logins, and history.
                </p>
                <p>
                  Your account and workspace data will be permanently deleted, except
                  information we may be required to retain by law or for
                  security/compliance purposes.
                </p>
                <p>This is not logout, archive, or subscription cancellation.</p>
              </div>
              <Field label="Current password" error={deleteFieldErrors.current_password}>
                <PasswordInput
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </Field>
              <Field
                label='Type DELETE to confirm'
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
                <button type="submit" className="btn-danger" disabled={deleting}>
                  {deleting ? "Deleting…" : "Permanently delete account"}
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
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </AccountSettingsSection>
      </div>
    </div>
  );
}
