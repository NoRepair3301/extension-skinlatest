import { getPageUrl, injectFile, onCommand, onInstalled, onOriginsAdded, onOriginsRemoved, onStartup, onStorageChanged, openOptionsPage, onMessage, openPaletteInPage, runInPage, runTool, setBadge, setTitle, showToast, unregisterAutoScript } from "./api.ts";
import { handleCommand, isCommand, type CommandDeps } from "./commands.ts";
import { loadSettings } from "./settings.ts";
import { isBadgeMessage } from "./messages.ts";
import { reconcile, scriptId } from "./siteActions.ts";
import { completeIntent, originsOfPatterns, serial } from "./keeper.ts";
import { INTENT_KEY } from "./intent.ts";

onMessage((message, senderTabId) => {
  if (message === "ping") return "pong";
  if (isBadgeMessage(message) && senderTabId !== undefined) void setBadge(senderTabId, "ON").catch(() => undefined);
  return undefined;
});

const deps: CommandDeps = {
  loadSettings,
  // The applier goes into every frame (it stays out of cross-origin ones by itself); the palette is top frame only.
  inject: (tabId, file) => injectFile(tabId, file, file === "applier.js"),
  runApplier: (tabId, method, arg) => runInPage(tabId, method, arg, method === "applyTheme" || method === "restore"),
  openPalette: openPaletteInPage,
  runTool: (tabId, method) => runTool(tabId, method),
  toast: showToast,
  pageUrl: getPageUrl,
  setBadge,
  setTitle,
};

/** Registrations follow the stored sites (A1b); then an intent left over from before the worker stopped is finished. */
const settle = (): void => {
  void serial(() => reconcile())
    .catch(() => undefined)
    .then(() => completeIntent("start"))
    .catch(() => undefined);
};

// Every start of the service worker (it is stopped and started many times a day). Idempotent.
settle();

// First install opens the settings page, which shows the welcome once (settings.welcomeDone). No extra permission.
onInstalled((reason) => {
  if (reason === "install") void openOptionsPage().catch(() => undefined);
  // An update may change the auto files (scene.js was added in rc6): every kept site gets the current list.
  if (reason === "install" || reason === "update") settle();
});
onStartup(settle);

// The user said yes to our prompt (the popup may already be closed): the background keeps the site and themes the tab.
onOriginsAdded((patterns) => {
  if (originsOfPatterns(patterns).length > 0) void completeIntent("added").catch(() => undefined);
});
// Site access taken away in the browser's settings: the registration goes too (the record stays, so it can be granted again).
onOriginsRemoved((patterns) => {
  for (const o of originsOfPatterns(patterns)) void unregisterAutoScript(scriptId(o)).catch(() => undefined);
});
// The popup wrote an intent: with the permission already granted there is no prompt and no onAdded, so the write itself is the signal.
onStorageChanged(INTENT_KEY, (value) => {
  if (value !== undefined) void completeIntent("changed").catch(() => undefined);
});

onCommand((command, tab) => {
  if (isCommand(command)) void handleCommand(deps, command, tab);
});
