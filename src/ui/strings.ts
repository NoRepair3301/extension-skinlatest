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
    autoTheme: "Auto",
    autoThemeHint: "Light by day, dark when your browser is dark",
    importTitle: "Import a theme code",
    importFormat: "A theme code starts with skinly1: followed by letters and numbers, for example skinly1:eyJ2IjoxLC4uLn0=. Paste the whole code from Copy theme code.",
    importButton: "Import",
    keep: "Keep on this site",
    keepNote: "Until you keep it, the theme lasts for this page only. Keeping asks to run Skinly on this site and nothing else.",
    keepDone: "Kept. Every page of this site gets the theme.",
    keepDenied: "Not kept: permission wasn't given. The theme lasts only until this page is reloaded.",
    keepNoOrigin: "This page can't be kept.",
    copyDone: "Theme code copied. It holds colours and scene only.",
    copyFailed: "Couldn't copy the code.",
    petLegend: "Pet",
    petToggle: "Show a small pet on pages I change",
    sentSummary: "What gets sent",
    sentBody:
      "Only after you agree and click: a small description of the page's layout (shapes, sizes and colours). Never text, links, images or forms. Before each send, \"Show what will be sent\" shows the exact message. Built-in themes send nothing.",
    ready: "Ready to change this page.",
    readyAuto: "Ready. Auto theme follows your browser.",
    readyNoPage: "Ready. Open a web page to change it.",
    appliedWithGap: "The theme is on. Something after it could not finish, so the page was left as it is now.",
    siteAuto: "This site changes automatically.",
    siteSaved: "This site is remembered.",
  },
  pet: {
    motion: "Motion",
    motions: { still: "Stays still", "bounce-v": "Bounces up and down", "bounce-h": "Bounces left and right", "top-bottom": "Top to bottom", "bottom-top": "Bottom to top", "left-right": "Left to right", "right-left": "Right to left" },
    speed: "Speed",
    speeds: { slow: "Slow", normal: "Normal", fast: "Fast" },
    edgeNote: "It moves in the empty side space. On a page with none, it walks along the screen edge.",
    options: "Pet options",
    kind: "Pet",
    kinds: { fox: "Fox", cat: "Cat", bunny: "Bunny", slime: "Slime", owl: "Owl", pebble: "Pebble", sprout: "Sprout" },
    size: "Size",
    sizes: { small: "Small", medium: "Medium", large: "Large" },
    edge: "Walks along",
    edges: { bottom: "Bottom edge", top: "Top edge", left: "Left edge", right: "Right edge" },
    keepFree: "Keep the pet in empty side space",
    edgeFallback: "If there is none, walk along the screen edge",
    sleep: "Let it sleep when I am idle",
  },
  asset: {
    title: "Use my picture on this page",
    none: "No saved pictures yet. Add one in Settings, My assets.",
    file: "Picture or video",
    choose: "Choose one",
    where: "Place it",
    modes: { lane: "In the empty side space", corner: "Small companion in a corner", cover: "Background behind the page" },
    size: "Size",
    sizes: { S: "Small", M: "Medium", L: "Large" },
    opacity: "Opacity",
    speed: "Speed",
    speeds: { slow: "Slow", normal: "Normal", fast: "Fast" },
    preset: "Movement",
    presets: { none: "Still", spin: "Spin", float: "Float", orbit: "Orbit", sway: "Sway", slide: "Slide", pulse: "Pulse", drift: "Drift" },
    use: "Use on this page",
    pickFirst: "Choose a picture or video first.",
    saved: "Saved for this site.",
    visitOnly: "Lasts for this visit. Remember the site to keep it.",
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
