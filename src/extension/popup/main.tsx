import { render } from "preact";
import { ErrorBoundary } from "../../ui/ErrorBoundary.tsx";
import { queryActiveTab, runInPage } from "../api.ts";
import { Popup } from "./Popup.tsx";
import { catchUnhandled } from "../../ui/safety.ts";
import { recordErrors } from "../diagStore.ts";
import "../../ui/tokens.css";
import "../../ui/ui.css";
import "./popup.css";

/** Used when the popup itself crashes: put the active page back as it was. */
const restoreActivePage = async (): Promise<void> => {
  const tab = await queryActiveTab();
  if (tab) await runInPage(tab.id, "restore", undefined, true);
};

catchUnhandled(window, recordErrors);

render(
  <ErrorBoundary onRestore={restoreActivePage}>
    <Popup />
  </ErrorBoundary>,
  document.getElementById("app")!,
);
