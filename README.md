# SVG Preflight Prototype

A local Vite + TypeScript prototype for preparing responsive SVG renditions for AEM.

## What this prototype does

- Upload Small / Medium / Large SVG renditions.
- Reads and parses SVGs entirely in the browser.
- Preserves the root `width`, `height`, `viewBox`, and other authored SVG attributes when present.
- If a usable `viewBox` is missing, attempts to derive one from the root `width` and `height`.
- If root `width` or `height` are missing but a valid `viewBox` is available, the prototype can derive those dimensions and flags the change for review.
- Adds the AEM/component attributes needed by each rendition:
  - `role="img"`
  - `focusable="false"`
  - `preserveAspectRatio="xMidYMid meet"`
  - `data-rendition="small|medium|large"`
- Adds the authored accessibility content directly to every prepared SVG rendition:
  - repeated `<title>`
  - repeated `<desc>`
  - unique IDs for each rendition's title and description
  - `aria-labelledby`
  - `aria-describedby`
- Namespaces existing SVG IDs and rewrites common internal references so masks, gradients, clip paths, filters, and similar features continue to work after processing.
- Checks and normalizes `font-family` names using `src/config.ts`.
- Flags:
  - unsafe `<script>` / `<foreignObject>` markup
  - inline `on*` event handlers
  - unsafe or external `href` references
  - raster `<image>` elements
  - unrecognized fonts
  - broken internal references
  - missing or invalid sizing/accessibility information
- Provides:
  - responsive Small / Medium / Large preview
  - container-width slider with a 320px minimum
  - Fill Width / Fixed Width preview
  - validation feedback for each uploaded rendition
  - prepared markup inspection
  - individual prepared SVG downloads

## Current responsive SVG assumptions

The prototype is based on the current Inline SVG component behavior.

### Rendition switching

Each SVG is identified with:

```html
data-rendition="small"
data-rendition="medium"
data-rendition="large"
```

The component uses container queries to switch between renditions at:

- Small: below 640px
- Medium: 640px–1087px
- Large: 1088px+

Only one rendition is displayed at a time.

### Fill Width mode

Fill Width is the default behavior.

The active SVG fills the available component width and maintains the aspect ratio defined by its `viewBox`.

```css
uc-inline-svg.responsive-svg[data-width-mode="fill"]
  > svg[data-rendition] {
  width: 100%;
  height: auto;
  max-width: none;
  margin-inline: 0;
}
```

### Fixed Width mode

In Fixed Width mode, the original root `width` is preserved and acts as the SVG's authored width.

The SVG can shrink when its container becomes narrower, but it does not scale beyond its authored width. When the container is wider, the SVG is centered.

```css
uc-inline-svg.responsive-svg[data-width-mode="fixed"]
  > svg[data-rendition] {
  height: auto;
  max-width: 100%;
  margin-inline: auto;
}
```

Because of this behavior, the preflight tool intentionally **does not remove the SVG's root `width` or `height` attributes** and does not add a `data-native-width` or inline `--svg-native-width` style.

## Accessibility fields

The tool includes shared Title and Description fields.

Those values are copied into each prepared SVG as native SVG accessibility markup:

```html
<svg
  role="img"
  aria-labelledby="example-small-title"
  aria-describedby="example-small-description"
  ...
>
  <title id="example-small-title">
    Why it pays to start early
  </title>

  <desc id="example-small-description">
    Accessible description of the visual content...
  </desc>

  ...
</svg>
```

Each rendition receives unique title and description IDs.

The Description field also includes a helper tip suggesting that designers can upload a screenshot of the SVG to Copilot and ask for an accessible description of the visual content.

## Run locally

Requires Node.js.

```bash
npm install
npm run dev
```

Vite will print a local URL, usually:

```text
http://localhost:5173
```

## Configure fonts

Edit:

```text
src/config.ts
```

Set the exact Unity font names you want to allow and any export-name aliases you want automatically normalized.

Example:

```ts
export const FONT_MAP = {
  "Connections Regular": "connections",
  "ConnectionsText": "connections text",
  "Connections Light": "connections",
  "Connections Medium": "connections",
};
```

The current processor checks font-family declarations found in:

- `font-family` attributes
- inline `style` attributes
- `<style>` elements

Unknown fonts are surfaced as warnings rather than silently replaced.

## Important prototype limitations

### 1. This is not the final security boundary

The prototype performs basic SVG sanitization and flags suspicious constructs, but AEM should still perform its own SVG validation and sanitization.

The browser-based tool should be treated as a designer-facing preflight utility, not as the sole security mechanism for production SVG ingestion.

### 2. Reused SVG assets still need render-time instance namespacing

This tool namespaces IDs inside the prepared file. If the exact same prepared SVG asset is inserted more than once on the same page, those IDs would still repeat between component instances.

The production AEM renderer should therefore add a unique **component-instance prefix** to all relevant SVG IDs and matching references when an asset is inserted inline.

This applies to IDs used by:

- masks
- gradients
- clip paths
- filters
- markers
- `<use>`
- `<textPath>`
- accessibility references
- any other internal SVG fragment reference

### 3. ID-reference rewriting is intentionally conservative

The prototype handles common forms such as:

- `url(#id)`
- `href="#id"`
- `xlink:href="#id"`
- common references in `<style>` blocks

Before production, add regression tests using real Figma and Illustrator exports that contain:

- gradients
- masks
- clipping paths
- filters
- markers
- `<use>`
- `<textPath>`
- stylesheet-based references
- unusual nested `<defs>` structures

### 4. SVGs can come from tools other than Figma

Most expected assets are Figma exports, but the tool should not assume Figma-specific markup.

Illustrator and other SVG authoring tools may produce different combinations of:

- XML/document boilerplate
- editor-specific metadata
- classes and `<style>` blocks
- font naming conventions
- masks and clipping paths
- external or embedded resources
- root sizing attributes

The processor should remain DOM-based and validation-driven rather than relying on exact Figma export patterns.

### 5. Font processing is still an initial implementation

The current processor can validate and normalize known font-family aliases, but the production version may benefit from an interactive workflow for unknown fonts.

For example:

```text
Unrecognized font: ArialMT

Map to:
[ Connections ▼ ]
```

That would allow designers to resolve font differences without editing `src/config.ts`.

### 6. Accessibility descriptions still require human review

The tool can embed and validate the presence of a title and description, but it cannot determine whether the authored description communicates the same meaningful information as the visual.

Generated descriptions should be reviewed by the designer/content author before export.

## Suggested next steps

1. Load several real Figma exports covering different SVG structures.
2. Load a few intentionally messy Illustrator exports.
3. Test assets containing gradients, masks, clip paths, filters, and `<use>` references.
4. Collect the warnings and errors that actually occur with production-like assets.
5. Harden `svgProcessor.ts` around those real cases.
6. Add interactive font mapping for unknown font-family values.
7. Add a "Download all" ZIP once the transformation behavior is stable.
8. Add automated regression tests for every known SVG edge case.
9. Test prepared assets inside the actual AEM Inline SVG component.
10. Validate accessibility behavior with screen readers and multiple component instances on the same page.
