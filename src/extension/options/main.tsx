import { render } from "preact";
import { ErrorBoundary } from "../../ui/ErrorBoundary.tsx";
import { Options } from "./Options.tsx";
import { catchUnhandled } from "../../ui/safety.ts";
import { recordErrors } from "../diagStore.ts";
import "../../ui/tokens.css";
import "../../ui/ui.css";
import "./options.css";

catchUnhandled(window, recordErrors);

render(
  <ErrorBoundary>
    <Options />
  </ErrorBoundary>,
  document.getElementById("app")!,
);
