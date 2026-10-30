# Data-use disclosure (draft for the store form; the human re-checks the current form)

- Personally identifiable information: not collected.
- Health, financial, authentication, personal communications, location, web history: not collected.
- User activity and website content: a layout-only summary of the current page is sent to the AI provider the user chose, only after the user clicks "Change my page" and accepts the consent text. The summary has shapes, sizes, colours, font family names and counts. It has no text, links, ids, images, form values, URLs or page titles, and is at most 20 KB. Without a key and consent nothing is sent.
- Website content (optional, separate consent per site): colour details of parts that look unreadable after restyling are sent to the same provider: tag names, up to three class names, computed colours, contrast numbers and colour declarations from the page's own stylesheets, at most 40 elements and 6 KB. No text, links, ids, form values, URLs or titles.
- Stored locally only: settings, the user's keys, remembered themes by site origin, and images or videos the user adds (never uploaded, never sent to a provider). Never page text, titles or full URLs.
- Not sold, not used for unrelated purposes, not used for creditworthiness or lending. No analytics or remote configuration.
- Provider terms apply to what the provider receives; they may keep it. Free tiers may use content to improve their products (the consent text says so).
