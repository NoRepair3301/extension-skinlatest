import { DENSITIES, LANE_CHOICES, SCENE_IDS } from "../features/scenes/types.ts";
import type { SceneSettings } from "./settings.ts";

const NAMES: Record<string, string> = {
  theme: "The theme's own scene",
  paper: "Paper",
  space: "Space",
  ocean: "Ocean",
  "midnight-stars": "Midnight stars",
  calm: "Calm",
  field: "Field",
  off: "Off",
};
const DENSITY = { low: "Fewer", normal: "Normal", high: "More" } as const;
const LANE = { both: "Both sides", left: "Left side", right: "Right side" } as const;

interface Props {
  scene: SceneSettings;
  onChange(scene: SceneSettings): void;
}

/** Scene art in the empty side space of a page. The art never covers page content; where there is no free space nothing is shown. */
export function SceneOptions({ scene, onChange }: Props) {
  const value = !scene.enabled || scene.choice === "none" ? "off" : scene.choice;
  return (
    <fieldset class="scene-options">
      <legend>Scene art</legend>
      <label>
        Scene
        <select
          value={value}
          onChange={(e) => {
            const v = (e.currentTarget as HTMLSelectElement).value;
            if (v === "off") onChange({ ...scene, enabled: false });
            else onChange({ ...scene, enabled: true, choice: v as SceneSettings["choice"] });
          }}
        >
          <option value="theme">{NAMES["theme"]}</option>
          {SCENE_IDS.filter((id) => id !== "none").map((id) => (
            <option key={id} value={id}>{NAMES[id]}</option>
          ))}
          <option value="off">{NAMES["off"]}</option>
        </select>
      </label>
      {value !== "off" && (
        <>
          <label>
            Amount
            <select value={scene.density} onChange={(e) => onChange({ ...scene, density: (e.currentTarget as HTMLSelectElement).value as SceneSettings["density"] })}>
              {DENSITIES.map((d) => (
                <option key={d} value={d}>{DENSITY[d]}</option>
              ))}
            </select>
          </label>
          <label>
            Where
            <select value={scene.lane} onChange={(e) => onChange({ ...scene, lane: (e.currentTarget as HTMLSelectElement).value as SceneSettings["lane"] })}>
              {LANE_CHOICES.map((l) => (
                <option key={l} value={l}>{LANE[l]}</option>
              ))}
            </select>
          </label>
        </>
      )}
      <p class="note">Art only appears in empty space beside the page. It never covers text, links, buttons or pictures, and it is still if your system asks for less motion.</p>
    </fieldset>
  );
}
