/**
 * Edit these values to match the actual Unity / AEM conventions.
 */

export const APPROVED_FONTS = [
  "connections",
  "connections text",
  "connections inline",
  "connections inline alts",
];

/**
 * Common export-name aliases -> Unity CSS family names.
 * Matching is case-insensitive in the processor.
 */
export const FONT_MAP: Record<string, string> = {
  Connections: "connections",
  "Connections Regular": "connections",
  "Connections Light": "connections",
  "Connections Medium": "connections",
  "Connections Bold": "connections",
  "Connections Italic": "connections",
  "Connections Light Italic": "connections",
  "Connections Medium Italic": "connections",
  "Connections Bold Italic": "connections",
  "Connections Text": "connections text",
  ConnectionsText: "connections text",
  "Connections Inline": "connections inline",
  "Connections Inline Alts": "connections inline alts",
};

export const BREAKPOINTS = {
  medium: 640,
  large: 1088,
};

export const MIN_PREVIEW_WIDTH = 320;
