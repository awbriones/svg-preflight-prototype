export type Rendition = "small" | "medium" | "large";
export type Severity = "ok" | "warning" | "error";

export interface ValidationMessage {
  severity: Severity;
  message: string;
}

export interface ProcessedSvg {
  rendition: Rendition;
  filename: string;
  source: string;
  output: string;
  previewMarkup: string;
  nativeWidth: number | null;
  nativeHeight: number | null;
  viewBox: string | null;
  fonts: string[];
  messages: ValidationMessage[];
}

export interface ProcessorOptions {
  rendition: Rendition;
  title: string;
  description: string;
  approvedFonts: string[];
  fontMap: Record<string, string>;
}
