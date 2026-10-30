import { PET_EDGES, PET_KINDS, PET_SIZES, PET_SPEEDS, type PetSettings } from "../settings.ts";
import { drawPet } from "../../features/pet/art.ts";
import { Thumb } from "../../ui/Thumb.tsx";
import { S } from "../../ui/strings.ts";

/** One choice that sets both the axis and the direction. Fixed list; nothing here is typed by the user. */
export const MOTION_CHOICES = ["still", "bounce-v", "bounce-h", "top-bottom", "bottom-top", "left-right", "right-left"] as const;
export type MotionChoice = (typeof MOTION_CHOICES)[number];

const AS_SETTINGS: Record<MotionChoice, Pick<PetSettings, "motion" | "direction">> = {
  still: { motion: "still", direction: "bounce" },
  "bounce-v": { motion: "vertical", direction: "bounce" },
  "bounce-h": { motion: "horizontal", direction: "bounce" },
  "top-bottom": { motion: "vertical", direction: "forward" },
  "bottom-top": { motion: "vertical", direction: "backward" },
  "left-right": { motion: "horizontal", direction: "forward" },
  "right-left": { motion: "horizontal", direction: "backward" },
};

/** The single choice that matches the saved motion and direction. */
export function motionChoice(p: Pick<PetSettings, "motion" | "direction">): MotionChoice {
  if (p.motion === "still") return "still";
  const hit = MOTION_CHOICES.find((c) => AS_SETTINGS[c].motion === p.motion && AS_SETTINGS[c].direction === p.direction);
  return hit ?? "still";
}

interface Props {
  pet: PetSettings;
  onChange(pet: PetSettings): void;
}

/**
 * The pet's look and behaviour. Motion and Speed sit right in the popup; the rest is under "Pet options".
 * Plain selects and checkboxes; every value comes from a fixed list.
 */
export function PetOptions({ pet, onChange }: Props) {
  const set = <K extends keyof PetSettings>(key: K, value: PetSettings[K]) => onChange({ ...pet, [key]: value });
  const select = <K extends "kind" | "size" | "speed" | "edge">(key: K, label: string, list: readonly PetSettings[K][], text: (v: PetSettings[K]) => string) => (
    <label>
      {label}
      <select value={pet[key] as string} onChange={(e) => set(key, (e.currentTarget as HTMLSelectElement).value as PetSettings[K])}>
        {list.map((v) => (
          <option key={String(v)} value={String(v)}>
            {text(v)}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <>
      <label>
        {S.pet.motion}
        <select value={motionChoice(pet)} onChange={(e) => onChange({ ...pet, ...AS_SETTINGS[(e.currentTarget as HTMLSelectElement).value as MotionChoice] })}>
          {MOTION_CHOICES.map((c) => (
            <option key={c} value={c}>
              {S.pet.motions[c]}
            </option>
          ))}
        </select>
      </label>
      {pet.motion !== "still" && select("speed", S.pet.speed, PET_SPEEDS, (v) => S.pet.speeds[v])}
      {pet.motion !== "still" && <p class="note">{S.pet.edgeNote}</p>}
      <div class="thumbs" role="group" aria-label={S.pet.kind}>
        {PET_KINDS.map((k) => (
          <button type="button" key={k} class="thumb-btn" aria-pressed={pet.kind === k} aria-label={S.pet.kinds[k]} title={S.pet.kinds[k]} onClick={() => set("kind", k)}>
            <Thumb draw={(doc) => drawPet(doc, k, "idle")} />
          </button>
        ))}
      </div>
      <details class="pet-options">
        <summary>{S.pet.options}</summary>
        {select("kind", S.pet.kind, PET_KINDS, (v) => S.pet.kinds[v])}
        {select("size", S.pet.size, PET_SIZES, (v) => S.pet.sizes[v])}
        {pet.motion !== "still" && !pet.keepInFreeSpace && select("edge", S.pet.edge, PET_EDGES, (v) => S.pet.edges[v])}
        <label>
          <input type="checkbox" checked={pet.keepInFreeSpace} onChange={(e) => set("keepInFreeSpace", (e.currentTarget as HTMLInputElement).checked)} />
          {S.pet.keepFree}
        </label>
        {pet.keepInFreeSpace && (
          <label>
            <input type="checkbox" checked={pet.edgeFallback} onChange={(e) => set("edgeFallback", (e.currentTarget as HTMLInputElement).checked)} />
            {S.pet.edgeFallback}
          </label>
        )}
        <label>
          <input type="checkbox" checked={pet.sleepWhenIdle} onChange={(e) => set("sleepWhenIdle", (e.currentTarget as HTMLInputElement).checked)} />
          {S.pet.sleep}
        </label>
      </details>
    </>
  );
}
