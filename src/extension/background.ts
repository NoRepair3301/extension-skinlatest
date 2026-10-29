import { injectFile, onCommand, onMessage, openPaletteInPage, runInPage, setBadge, setTitle } from "./api.ts";
import { handleCommand, isCommand, type CommandDeps } from "./commands.ts";
import { loadSettings } from "./settings.ts";
import { isBadgeMessage } from "./messages.ts";

onMessage((message, senderTabId) => {
  if (message === "ping") return "pong";
  if (isBadgeMessage(message) && senderTabId !== undefined) void setBadge(senderTabId, "ON").catch(() => undefined);
  return undefined;
});

const deps: CommandDeps = {
  loadSettings,
  inject: injectFile,
  runApplier: (tabId, method, arg) => runInPage(tabId, method, arg),
  openPalette: openPaletteInPage,
  setBadge,
  setTitle,
};

onCommand((command, tab) => {
  if (isCommand(command)) void handleCommand(deps, command, tab);
});
