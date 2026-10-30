import type { ComponentChildren, JSX } from "preact";
import { useEffect, useId, useRef } from "preact/hooks";

type Kind = "primary" | "secondary" | "quiet";
const FOCUSABLE = "button, [href], input, select, textarea";

export function Button({ kind = "secondary", children, ...rest }: { kind?: Kind; children?: ComponentChildren } & Omit<JSX.IntrinsicElements["button"], "type" | "kind" | "children" | "ref">) {
  const cls = `ui-btn${kind === "primary" ? " ui-btn-primary" : kind === "quiet" ? " ui-btn-quiet" : ""}`;
  return <button type="button" class={cls} {...rest}>{children}</button>;
}

/** A switch built on a real checkbox, so keyboard and screen readers work unchanged. */
export function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange(v: boolean): void; disabled?: boolean }) {
  return (
    <label class="ui-toggle">
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange((e.currentTarget as HTMLInputElement).checked)} />
      <span class="track" aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
}

export function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: ReadonlyArray<{ value: T; label: string }>; onChange(v: T): void }) {
  return (
    <label class="ui-row">
      <span>{label}</span>
      <select class="ui-select" value={value} onChange={(e) => onChange((e.currentTarget as HTMLSelectElement).value as T)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function Card({ title, children }: { title?: string; children?: ComponentChildren }) {
  const id = useId();
  return (
    <section class="ui-card" aria-labelledby={title ? id : undefined}>
      {title && <h2 id={id}>{title}</h2>}
      {children}
    </section>
  );
}

/** WAI-ARIA tabs: arrow keys, Home and End move between tabs; only the selected tab is in the tab order. */
export function Tabs({ label, tabs, selected, onSelect }: { label: string; tabs: ReadonlyArray<{ id: string; label: string }>; selected: string; onSelect(id: string): void }) {
  const move = (e: KeyboardEvent, i: number) => {
    const n = tabs.length;
    const j = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i + n - 1) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (j < 0) return;
    e.preventDefault();
    onSelect(tabs[j]!.id);
    (e.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLElement>('[role="tab"]')[j]?.focus();
  };
  return (
    <div class="ui-tabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button key={t.id} type="button" role="tab" class="ui-tab" id={`tab-${t.id}`} aria-selected={t.id === selected} aria-controls={`panel-${t.id}`} tabIndex={t.id === selected ? 0 : -1} onClick={() => onSelect(t.id)} onKeyDown={(e) => move(e, i)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export const TabPanel = ({ id, selected, children, keep }: { id: string; selected: string; children?: ComponentChildren; keep?: boolean }) =>
  keep ? <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} hidden={id !== selected}>{children}</div> :
  id === selected ? <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`}>{children}</div> : null;

/** A short message that goes away by itself (2 s by default). A polite live region, so it is read out but never steals focus. */
export function Toast({ message, onDone, ms = 2000 }: { message: string; onDone?(): void; ms?: number }) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => onDone?.(), ms);
    return () => clearTimeout(t);
  }, [message]);
  return <div role="status" aria-live="polite">{message && <div class="ui-toast">{message}</div>}</div>;
}

export function Banner({ tone = "info", children }: { tone?: "info" | "error" | "ok"; children?: ComponentChildren }) {
  return <div class={`ui-banner${tone === "error" ? " ui-banner-error" : tone === "ok" ? " ui-banner-ok" : ""}`} role={tone === "error" ? "alert" : "status"}>{children}</div>;
}

export function EmptyState({ title, children }: { title: string; children?: ComponentChildren }) {
  return <div class="ui-empty"><h2>{title}</h2>{children && <p>{children}</p>}</div>;
}

export function Spinner({ label }: { label: string }) {
  return <span class="ui-spinner" role="progressbar" aria-label={label} />;
}

/** Help text that shows on hover and on keyboard focus; the wrapper points at it with aria-describedby. */
export function Tooltip({ text, children }: { text: string; children?: ComponentChildren }) {
  const id = useId();
  return (
    <span class="ui-tip" aria-describedby={id}>
      {children}
      <span role="tooltip" id={id}>{text}</span>
    </span>
  );
}

/** A modal dialog that traps focus, closes on Escape, and returns focus to whatever opened it. */
export function Dialog({ title, children, onClose }: { title: string; children?: ComponentChildren; onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const d = ref.current!;
    if (typeof d.showModal === "function") d.showModal();
    else d.setAttribute("open", "");
    d.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => {
      if (typeof d.close === "function" && d.open) d.close();
      opener?.focus?.();
    };
  }, []);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Tab") {
      const f = Array.from(ref.current!.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => !(n as HTMLButtonElement).disabled);
      if (f.length === 0) return;
      const first = f[0]!;
      const last = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  return (
    <dialog ref={ref} class="ui-dialog" aria-labelledby={id} aria-modal="true" onKeyDown={onKey} onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <h2 id={id}>{title}</h2>
      {children}
    </dialog>
  );
}
