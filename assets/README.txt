Skinly AI logo pack (original artwork, made in code)

skinly-logo.svg / skinly-logo-512.png  Full logo: unicorn head, rainbow mane, sparkle. Use in the popup header, options page, store listing.
skinly-icon.svg                        Zoomed version for small sizes.
icons/icon-16|32|48|128.png            Extension toolbar icons made from skinly-icon.svg.

Use in the project:
1. Copy icons/*.png into the project, for example assets/icons/.
2. Put skinly-logo.svg in assets/ and inline it in the popup header.
3. Point manifest.json "icons" and "action.default_icon" at the four PNG files.
4. The old procedural icon generator (scripts/icons.ts) can be replaced by copying these files into dist/icons at build.

Note: the SVG files carry an xmlns attribute with a web address. When you inline the SVG in the popup (Preact), remove the xmlns attribute: the rule scanner flags any URL literal in src/. A file loaded as an image (img src) keeps it.
