import { useEffect, useState } from "preact/hooks";
import { Button, Dialog } from "../../ui/components.tsx";
import { S } from "../../ui/strings.ts";
import { buildConfig, type BackendConfig } from "../../backend/config.ts";
import { loadOffers, type PlanOffer } from "../../backend/entitlement.ts";
import { formatPrice } from "../options/PlanAccount.tsx";
import { openOptionsPage } from "../api.ts";

const P = S.plus;

/**
 * The calm Plus dialog (no dark patterns): what Plus includes, the server's price, how to cancel, and a plain "Stay on Free" that is as
 * easy as anything else. No timers, no pre-checked boxes, no nagging; closing it changes nothing.
 */
export function PlusDialog({ what, onClose, cfg = buildConfig() ?? null, openSettings = () => void openOptionsPage().catch(() => undefined) }: { what: string; onClose(): void; cfg?: BackendConfig | null; openSettings?(): void }) {
  const [offer, setOffer] = useState<PlanOffer | undefined>(undefined);
  useEffect(() => {
    if (!cfg) return;
    void loadOffers(cfg)
      .then((r) => r.ok && setOffer(r.value[0]))
      .catch(() => undefined);
  }, []);
  return (
    <Dialog title={P.title} onClose={onClose}>
      <p>{P.lockedTheme(what)}</p>
      {cfg ? (
        <>
          <ul class="plus-list">
            {P.includes.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
          <p class="note">{offer ? P.price(formatPrice(offer), offer.interval) : P.priceUnknown}</p>
          <p class="note">{P.cancel}</p>
          <p class="note">{P.freeIncludes}</p>
        </>
      ) : (
        <p class="note">{P.unavailable}</p>
      )}
      <div class="row">
        <Button kind="primary" onClick={onClose}>
          {P.stayFree}
        </Button>
        {cfg && (
          <Button
            onClick={() => {
              openSettings();
              onClose();
            }}
          >
            {P.seePlans}
          </Button>
        )}
      </div>
    </Dialog>
  );
}
