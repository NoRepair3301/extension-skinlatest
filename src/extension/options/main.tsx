import { render } from "preact";
import { ErrorBoundary } from "../../ui/ErrorBoundary.tsx";
import { Options } from "./Options.tsx";
import "../../ui/tokens.css";
import "../../ui/ui.css";
import "./options.css";

render(
  <ErrorBoundary>
    <Options />
  </ErrorBoundary>,
  document.getElementById("app")!,
);
