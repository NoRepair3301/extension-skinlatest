import { S } from "../ui/strings.ts";
import type { SceneSettings } from "./settings.ts";

interface Props {
  scene: SceneSettings;
  onChange(scene: SceneSettings): void;
}

/** One switch. The art follows the theme and appears only in empty space (side gutters, else one small corner strip). */
export function SceneOptions({ scene, onChange }: Props) {
  return (
    <fieldset class="scene-options">
      <legend>{S.scene.legend}</legend>
      <label>
        <input type="checkbox" checked={scene.enabled} onChange={(e) => onChange({ ...scene, enabled: (e.currentTarget as HTMLInputElement).checked })} />
        {S.scene.show}
      </label>
      <p class="note">{S.scene.note}</p>
    </fieldset>
  );
}
