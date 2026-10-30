import { PET_DIRECTIONS, PET_EDGES, PET_KINDS, PET_MOTIONS, PET_SIZES, PET_SPEEDS, type PetSettings } from "../settings.ts";

const LABEL = {
  kind: { fox: "Fox", cat: "Cat", bunny: "Bunny", slime: "Slime", owl: "Owl", pebble: "Pebble", sprout: "Sprout" },
  size: { small: "Small", medium: "Medium", large: "Large" },
  motion: { still: "Stays still", horizontal: "Walks sideways", vertical: "Walks up and down" },
  speed: { slow: "Slow", normal: "Normal", fast: "Fast" },
  edge: { bottom: "Bottom edge", top: "Top edge", left: "Left edge", right: "Right edge" },
} as const;

const directionLabel = (motion: PetSettings["motion"], d: PetSettings["direction"]): string => {
  const horizontal = motion !== "vertical";
  if (d === "forward") return horizontal ? "Left to right" : "Top to bottom";
  if (d === "backward") return horizontal ? "Right to left" : "Bottom to top";
  return "Back and forth";
};

interface Props {
  pet: PetSettings;
  onChange(pet: PetSettings): void;
}

/** The pet's look and behaviour. Plain selects and checkboxes; every value comes from a fixed list. */
export function PetOptions({ pet, onChange }: Props) {
  const set = <K extends keyof PetSettings>(key: K, value: PetSettings[K]) => onChange({ ...pet, [key]: value });
  const select = <K extends "kind" | "size" | "motion" | "direction" | "speed" | "edge">(key: K, label: string, list: readonly PetSettings[K][], text: (v: PetSettings[K]) => string) => (
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
    <details class="pet-options">
      <summary>Pet options</summary>
      {select("kind", "Pet", PET_KINDS, (v) => LABEL.kind[v])}
      {select("size", "Size", PET_SIZES, (v) => LABEL.size[v])}
      {select("motion", "Movement", PET_MOTIONS, (v) => LABEL.motion[v])}
      {pet.motion !== "still" && select("direction", "Direction", PET_DIRECTIONS, (v) => directionLabel(pet.motion, v))}
      {pet.motion !== "still" && select("speed", "Speed", PET_SPEEDS, (v) => LABEL.speed[v])}
      {pet.motion !== "still" && !pet.keepInFreeSpace && select("edge", "Walks along", PET_EDGES, (v) => LABEL.edge[v])}
      <label>
        <input type="checkbox" checked={pet.keepInFreeSpace} onChange={(e) => set("keepInFreeSpace", (e.currentTarget as HTMLInputElement).checked)} />
        Keep the pet in empty side space
      </label>
      <label>
        <input type="checkbox" checked={pet.sleepWhenIdle} onChange={(e) => set("sleepWhenIdle", (e.currentTarget as HTMLInputElement).checked)} />
        Let it sleep when I am idle
      </label>
    </details>
  );
}
