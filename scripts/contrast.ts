import { contrastFailures } from "../src/plan/contrast.ts";
import { THEMES } from "../src/themes/index.ts";

const failures = THEMES.flatMap((t) => contrastFailures(t.id, t.tokens));
if (failures.length > 0) {
  process.stdout.write(failures.map((f) => `contrast: FAIL ${f}\n`).join(""));
  process.exitCode = 1;
} else {
  process.stdout.write(`contrast: ok (${THEMES.length} themes)\n`);
}
