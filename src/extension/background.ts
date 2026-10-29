import { onMessage, setBadge } from "./api.ts";
import { isBadgeMessage } from "./messages.ts";

onMessage((message, senderTabId) => {
  if (message === "ping") return "pong";
  if (isBadgeMessage(message) && senderTabId !== undefined) void setBadge(senderTabId, "ON").catch(() => undefined);
  return undefined;
});
