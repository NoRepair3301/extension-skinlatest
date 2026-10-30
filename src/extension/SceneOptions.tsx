import { DENSITIES, LANE_CHOICES, SCENE_IDS } from "../features/scenes/types.ts";
import { sceneThumb } from "../features/scenes/thumb.ts";
import { Thumb } from "../ui/Thumb.tsx";
import { S } from "../ui/strings.ts";
import type { SceneSettings } from "./settings.ts";

interface Props {
  scene: SceneSettings;
  onChange(scene: SceneSettings): void;
}

/** Scene art in the empty side space of a page. The art never covers page content; where there is no free space nothing is shown. */
export function SceneOptions({ scene, onChange }: Props) {
  const value = !scene.enabled || scene.choice === "none" ? "off" : scene.choice;
  return (
    <fieldset class="scene-options">
      <legend>{S.scene.legend}</legend>
      <label>
        {S.scene.scene}
        <select
          value={value}
          onChange={(e) => {
            const v = (e.currentTarget as HTMLSelectElement).value;
            if (v === "off") onChange({ ...scene, enabled: false });
            else onChange({ ...scene, enabled: true, choice: v as SceneSettings["choice"] });
          }}
        >
          <option value="theme">{S.scene.names["theme"]}</option>
          {SCENE_IDS.filter((id) => id !== "none").map((id) => (
            <option key={id} value={id}>{S.scene.names[id]}</option>
          ))}
          <option value="off">{S.scene.names["off"]}</option>
        </select>
      </label>
      <div class="thumbs" role="group" aria-label={S.scene.legend}>
        {SCENE_IDS.filter((id) => id !== "none").map((id) => (
          <button type="button" key={id} class="thumb-btn" aria-pressed={value === id} aria-label={S.scene.names[id]} title={S.scene.names[id]} onClick={() => onChange({ ...scene, enabled: true, choice: id })}>
            <Thumb draw={(doc) => sceneThumb(doc, id, "#2f6fdb")} />
          </button>
        ))}
      </div>
      {value !== "off" && (
        <>
          <label>
            {S.scene.amount}
            <select value={scene.density} onChange={(e) => onChange({ ...scene, density: (e.currentTarget as HTMLSelectElement).value as SceneSettings["density"] })}>
              {DENSITIES.map((d) => (
                <option key={d} value={d}>{S.scene.densities[d]}</option>
              ))}
            </select>
          </label>
          <label>
            {S.scene.where}
            <select value={scene.lane} onChange={(e) => onChange({ ...scene, lane: (e.currentTarget as HTMLSelectElement).value as SceneSettings["lane"] })}>
              {LANE_CHOICES.map((l) => (
                <option key={l} value={l}>{S.scene.lanes[l]}</option>
              ))}
            </select>
          </label>
        </>
      )}
      <p class="note">{S.scene.note}</p>
    </fieldset>
  );
}
