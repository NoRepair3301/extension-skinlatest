/**
 * Every line of text our own UI shows lives here (English only for now). A second language is a data change:
 * add an object with the same keys to LOCALES. Plain, friendly, short; errors say what happened and what to do.
 * Messages from the AI flow (consent, blocked, errors) stay in src/ai/messages.ts, which is the SPEC 11 copy.
 */

export const en = {
  app: { name: "Skinly AI", notAffiliated: "Skinly AI is not affiliated with any website." },
  popup: {
    change: "Change my page",
    restore: "Restore original",
    cancel: "Cancel",
    themeLegend: "Theme",
    autoTheme: "Auto (light by day, dark when your browser is dark)",
    petLegend: "Pet",
    petToggle: "Show a small pet on pages I change",
    sentSummary: "What gets sent",
    sentBody:
      "Only after you agree and click: a small description of the page's layout (shapes, sizes and colours). Never text, links, images or forms. Before each send, \"Show what will be sent\" shows the exact message. Built-in themes send nothing.",
    ready: "Ready to change this page.",
    readyAuto: "Ready. Auto theme follows your browser.",
    readyNoPage: "Ready. Open a web page to change it.",
    siteAuto: "This site changes automatically.",
    siteSaved: "This site is remembered.",
  },
  steps: {
    checking: "Checking this page…",
    baseline: "Applying the built-in theme…",
    analysing: "Reading the page layout…",
    consent: "Waiting for your answer…",
    asking: "Asking the AI for a better theme…",
    applying: "Applying…",
  },
  options: {
    title: "Skinly AI settings",
    tabsLabel: "Settings sections",
    tabs: {
      general: "General",
      themes: "Themes",
      scenes: "Scenes and pets",
      assets: "My assets",
      providers: "AI providers",
      sites: "Sites",
      shortcuts: "Shortcuts",
      privacy: "Privacy",
      about: "About",
    },
    receives:
      "Receives only a small description of a page's layout (shapes, sizes and colours, no text, links, images or forms), and only after you agree and click. Their terms apply and they may keep it.",
    noSites: "No sites saved.",
    noSitesHint: "Sites you remember from the popup show up here.",
    noShortcuts: "No shortcuts to show.",
    eraseTitle: "Erase all Skinly data",
    eraseDialog: "Erase all Skinly data?",
    eraseBody: "This removes your settings, keys, saved sites and assets from this device. It cannot be undone.",
    eraseConfirm: "Erase everything",
    erased: "All Skinly data was erased.",
    eraseFailed: "Couldn't erase everything. Try again.",
    showWelcome: "Show the welcome again",
  },
  welcome: {
    title: "Welcome to Skinly AI",
    step: (n: number, total: number) => `Step ${n} of ${total}`,
    look: "Pick a look. You can change it any time from the toolbar popup.",
    art: "Show art in the empty side space of pages",
    key: "Optional: add a key to let an AI provider improve a theme. Built-in themes work without one.",
    privacy1: "Your pages and your keys stay on this device.",
    privacy2: "Only after you agree, and only when you click, a small description of a page's layout (no text, links, images or forms) goes to the provider you chose.",
    next: "Next",
    back: "Back",
    skip: "Skip",
    done: "Done",
  },
  boundary: {
    message: "Something went wrong in Skinly AI. Your page has not been changed by this.",
    restore: "Restore this page",
    reload: "Reload this panel",
    restored: "This page was restored.",
    restoreFailed: "Couldn't restore this page. Reload it to get the original back.",
  },
  keys: {
    saved: "Key saved.",
    removed: "Key removed.",
    badKey: "That does not look like a key.",
    noPermission: "Permission for this provider was not granted, so the key was not saved.",
  },
};

export type Strings = typeof en;

/** Add a locale here with the same shape as `en`; the test checks that every key exists. */
export const LOCALES: Record<string, Strings> = { en };

export const pickLocale = (lang: string | undefined): Strings => LOCALES[(lang ?? "en").slice(0, 2).toLowerCase()] ?? en;

export const S: Strings = pickLocale(typeof navigator === "undefined" ? undefined : navigator.language);
