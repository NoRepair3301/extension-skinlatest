import { useEffect, useState } from "preact/hooks";
import { Banner, Button, Card, Dialog } from "../../ui/components.tsx";
import { S } from "../../ui/strings.ts";
import { useOnline } from "../../ui/online.ts";
import { buildConfig, type BackendConfig } from "../../backend/config.ts";
import { sendCode, signOut, verifyCode, type AuthDeps } from "../../backend/auth.ts";
import { deleteAccount, loadOffers, recompute, refreshEntitlement, startCheckout, type AccountState, type PlanOffer } from "../../backend/entitlement.ts";
import type { BackendError } from "../../backend/http.ts";
import type { PlanFlag } from "../../core/entitlements.ts";

const P = S.plus;

/** "1.234,56 EUR" style money from the server's minor units, in the browser's locale. */
export function formatPrice(o: Pick<PlanOffer, "priceMinor" | "currency">, locale?: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: o.currency }).format(o.priceMinor / 100);
  } catch {
    return `${(o.priceMinor / 100).toFixed(2)} ${o.currency}`;
  }
}

const date = (s: number): string => new Date(s * 1000).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

interface Props {
  /** The build config; `null` means Plus is not available in this build. Defaults to the real build config. */
  cfg?: BackendConfig | null;
  deps?: AuthDeps;
  /** Opens the checkout link (a plain new tab; no permission). Tests pass their own. */
  openLink?(url: string): void;
  onPlan?(plan: PlanFlag): void;
}

/** Settings, "Plan and account": email code sign-in, plan status, Upgrade, Manage, Refresh purchase, Sign out, Delete account. */
export function PlanAccount({ cfg = buildConfig() ?? null, deps, openLink = (u) => void window.open(u, "_blank", "noopener,noreferrer"), onPlan }: Props) {
  const online = useOnline();
  const [state, setState] = useState<AccountState | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState("");
  const [offer, setOffer] = useState<PlanOffer | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const show = (s: AccountState) => {
    setState(s);
    onPlan?.(s.plan);
    if (s.error) setLine(P.errors[s.error]);
  };
  const err = (e: BackendError) => setLine(P.errors[e]);

  useEffect(() => {
    if (!cfg) return;
    void recompute(cfg, deps)
      .then(show)
      .catch(() => undefined);
    void loadOffers(cfg, deps)
      .then((r) => r.ok && setOffer(r.value[0]))
      .catch(() => undefined);
  }, []);

  if (!cfg) {
    return (
      <Card title={P.tab}>
        <p class="note">{P.unavailable}</p>
      </Card>
    );
  }

  const run = async (job: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setLine("");
    try {
      await job();
    } catch {
      setLine(P.errors.server);
    } finally {
      setBusy(false);
    }
  };

  const onSend = () =>
    run(async () => {
      const r = await sendCode(cfg, email, deps);
      if (!r.ok) return err(r.error);
      setCodeSent(true);
      setLine(P.codeSent);
    });
  const onVerify = () =>
    run(async () => {
      const r = await verifyCode(cfg, email, code, deps);
      if (!r.ok) return err(r.error);
      setCode("");
      setCodeSent(false);
      show(await refreshEntitlement(cfg, deps));
    });
  const onRefresh = () =>
    run(async () => {
      const s = await refreshEntitlement(cfg, deps);
      show(s);
      if (!s.error) setLine(P.refreshed);
    });
  const onUpgrade = () =>
    run(async () => {
      if (!offer) return err(online ? "unavailable" : "offline");
      const r = await startCheckout(cfg, offer.id, deps);
      if (!r.ok) return err(r.error);
      openLink(r.value);
      setLine(P.checkoutOpened);
    });
  const onSignOut = () =>
    run(async () => {
      await signOut(cfg, deps);
      show(await recompute(cfg, deps));
      setLine(P.signedOut);
    });
  const onDelete = () =>
    run(async () => {
      setConfirmDelete(false);
      const r = await deleteAccount(cfg, deps);
      if (!r.ok) return err(r.error);
      show(await recompute(cfg, deps));
      setLine(P.deleted);
    });

  const signedIn = state?.signedIn === true;
  return (
    <>
      {!online && <Banner>{P.errors.offline}</Banner>}
      <Card title={P.title}>
        <ul class="plus-list">
          {P.includes.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
        <p class="note">{P.freeIncludes}</p>
        <p class="note">{offer ? P.price(formatPrice(offer), offer.interval) : P.priceUnknown}</p>
        <p class="note">{P.honest}</p>
      </Card>
      <Card title={P.tab}>
        {!signedIn && (
          <>
            <p class="note">{P.signedOutLine}</p>
            <div class="field-grid">
              <label>
                {P.emailLabel}
                <input type="email" autocomplete="email" value={email} maxLength={254} onInput={(e) => setEmail((e.currentTarget as HTMLInputElement).value)} />
              </label>
              <Button onClick={() => void onSend()} disabled={busy || email.trim() === ""}>
                {P.sendCode}
              </Button>
              {codeSent && (
                <>
                  <label>
                    {P.codeLabel}
                    <input inputMode="numeric" autocomplete="one-time-code" value={code} maxLength={12} onInput={(e) => setCode((e.currentTarget as HTMLInputElement).value)} />
                  </label>
                  <Button kind="primary" onClick={() => void onVerify()} disabled={busy || code.trim() === ""}>
                    {P.verify}
                  </Button>
                </>
              )}
            </div>
          </>
        )}
        {signedIn && state && (
          <>
            <p>{P.signedInAs(state.email ?? "")}</p>
            <p class="note">{P.statusLine[state.status]}</p>
            {state.renewsAt !== null && state.plan === "plus" && <p class="note">{P.renews(date(state.renewsAt))}</p>}
            <div class="row">
              {state.plan === "free" && (
                <Button kind="primary" onClick={() => void onUpgrade()} disabled={busy}>
                  {P.upgrade}
                </Button>
              )}
              {state.plan === "plus" && <Button onClick={() => setLine(P.manageLine)}>{P.manage}</Button>}
              <Button onClick={() => void onRefresh()} disabled={busy}>
                {P.refresh}
              </Button>
              <Button kind="quiet" onClick={() => void onSignOut()} disabled={busy}>
                {P.signOut}
              </Button>
              <Button kind="quiet" onClick={() => setConfirmDelete(true)} disabled={busy}>
                {P.deleteAccount}
              </Button>
            </div>
          </>
        )}
        <p class="note" role="status" aria-live="polite">
          {busy ? P.working : line}
        </p>
      </Card>
      {confirmDelete && (
        <Dialog title={P.deleteTitle} onClose={() => setConfirmDelete(false)}>
          <p>{P.deleteBody}</p>
          <div class="row">
            <Button onClick={() => setConfirmDelete(false)}>{P.deleteCancel}</Button>
            <Button kind="primary" onClick={() => void onDelete()}>
              {P.deleteConfirm}
            </Button>
          </div>
        </Dialog>
      )}
    </>
  );
}
