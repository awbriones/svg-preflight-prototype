import type {
  ProcessedSvg,
  ProcessorOptions,
  Rendition,
  ValidationMessage,
} from "./types.ts";

const BLOCKED_ELEMENTS = ["script", "foreignObject"];
const BLOCKED_URL_PATTERN = /^(?:javascript:|data:text\/html)/i;

function addMessage(
  messages: ValidationMessage[],
  severity: ValidationMessage["severity"],
  message: string,
) {
  messages.push({ severity, message });
}

function parseViewBox(viewBox: string | null) {
  if (!viewBox) return null;

  const values = viewBox
    .trim()
    .split(/[\s,]+/)
    .map(Number);

  if (
    values.length !== 4 ||
    values.some((value) => !Number.isFinite(value)) ||
    values[2] <= 0 ||
    values[3] <= 0
  ) {
    return null;
  }

  return {
    x: values[0],
    y: values[1],
    width: values[2],
    height: values[3],
  };
}

/**
 * The component's Fixed Width mode relies on the root SVG's intrinsic
 * dimensions, so this prototype accepts only unitless or px root sizes as a
 * directly usable authored pixel size.
 */
function getPixelDimension(value: string | null) {
  if (!value) return null;

  const match = value.trim().match(/^(-?\d*\.?\d+)(px)?$/i);
  if (!match) return null;

  const number = Number(match[1]);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

/**
 * Deterministic asset-level prefix. Production AEM should still add a unique
 * component-instance prefix when the same prepared asset is reused on a page.
 */
function createPrefix(filename: string, rendition: Rendition) {
  const base = slugify(filename.replace(/\.svg$/i, "")) || "graphic";
  return `uc-${base}-${rendition}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitize(svg: SVGSVGElement, messages: ValidationMessage[]) {
  for (const selector of BLOCKED_ELEMENTS) {
    const nodes = [...svg.querySelectorAll(selector)];

    if (nodes.length) {
      nodes.forEach((node) => node.remove());
      addMessage(
        messages,
        "error",
        `Removed ${nodes.length} <${selector}> element${nodes.length === 1 ? "" : "s"}.`,
      );
    }
  }

  const all = [svg, ...svg.querySelectorAll("*")];

  for (const element of all) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();

      if (name.startsWith("on")) {
        element.removeAttribute(attribute.name);
        addMessage(
          messages,
          "error",
          `Removed unsafe ${attribute.name} event handler.`,
        );
        continue;
      }

      if (
        (name === "href" || name === "xlink:href") &&
        BLOCKED_URL_PATTERN.test(value)
      ) {
        element.removeAttribute(attribute.name);
        addMessage(
          messages,
          "error",
          `Removed unsafe ${attribute.name} reference.`,
        );
        continue;
      }

      if (
        (name === "href" || name === "xlink:href") &&
        /^https?:\/\//i.test(value)
      ) {
        addMessage(
          messages,
          "warning",
          `External resource reference found: ${value}`,
        );
      }
    }
  }
}

function ensureViewBox(svg: SVGSVGElement, messages: ValidationMessage[]) {
  let viewBox = svg.getAttribute("viewBox");
  let parsed = parseViewBox(viewBox);

  if (parsed) {
    addMessage(messages, "ok", `viewBox preserved: ${viewBox}`);
    return parsed;
  }

  const width = getPixelDimension(svg.getAttribute("width"));
  const height = getPixelDimension(svg.getAttribute("height"));

  if (width && height) {
    viewBox = `0 0 ${width} ${height}`;
    svg.setAttribute("viewBox", viewBox);
    parsed = parseViewBox(viewBox);

    addMessage(
      messages,
      "warning",
      `No usable viewBox found. Added viewBox="${viewBox}" from the root width and height.`,
    );

    return parsed;
  }

  addMessage(
    messages,
    "error",
    "SVG has no usable viewBox, and one could not be derived from root width/height.",
  );

  return null;
}

/**
 * Latest component behavior preserves root width/height because those values
 * provide the authored intrinsic size used by Fixed Width mode.
 *
 * If an export is missing either value (or uses a percentage/unsupported unit),
 * normalize that dimension from the viewBox so the component has a predictable
 * intrinsic size.
 */
function ensureRootDimensions(
  svg: SVGSVGElement,
  viewBox: ReturnType<typeof parseViewBox>,
  messages: ValidationMessage[],
) {
  const originalWidth = svg.getAttribute("width");
  const originalHeight = svg.getAttribute("height");

  let width = getPixelDimension(originalWidth);
  let height = getPixelDimension(originalHeight);

  if (width) {
    addMessage(messages, "ok", `Root width preserved: ${originalWidth}`);
  } else if (viewBox) {
    width = viewBox.width;
    svg.setAttribute("width", String(width));
    addMessage(
      messages,
      "warning",
      originalWidth
        ? `Root width "${originalWidth}" is not a usable fixed pixel width. Replaced it with ${width} from the viewBox.`
        : `Root width was missing. Added width="${width}" from the viewBox.`,
    );
  } else {
    addMessage(messages, "error", "Root width is missing or unusable.");
  }

  if (height) {
    addMessage(messages, "ok", `Root height preserved: ${originalHeight}`);
  } else if (viewBox) {
    height = viewBox.height;
    svg.setAttribute("height", String(height));
    addMessage(
      messages,
      "warning",
      originalHeight
        ? `Root height "${originalHeight}" is not a usable fixed pixel height. Replaced it with ${height} from the viewBox.`
        : `Root height was missing. Added height="${height}" from the viewBox.`,
    );
  } else {
    addMessage(messages, "error", "Root height is missing or unusable.");
  }

  return { width, height };
}

/**
 * Normalize the root attributes the Inline SVG component needs while preserving
 * the exported root width, height, viewBox, fill, xmlns, and other artwork attributes.
 *
 * Accessibility metadata is embedded into each prepared SVG rendition in a
 * separate step after existing artwork IDs have been namespaced.
 */
function normalizeRoot(
  svg: SVGSVGElement,
  options: ProcessorOptions,
  messages: ValidationMessage[],
) {
  let removedAccessibleMetadata = 0;

  for (const child of [...svg.children]) {
    if (child.localName === "title" || child.localName === "desc") {
      child.remove();
      removedAccessibleMetadata += 1;
    }
  }

  if (removedAccessibleMetadata) {
    addMessage(
      messages,
      "warning",
      `Replaced ${removedAccessibleMetadata} existing root <title>/<desc> element${removedAccessibleMetadata === 1 ? "" : "s"} with the authored preflight values.`,
    );
  }

  svg.removeAttribute("aria-labelledby");
  svg.removeAttribute("aria-describedby");

  svg.setAttribute("role", "img");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("data-rendition", options.rendition);

  addMessage(
    messages,
    "ok",
    `Added component attributes for the ${options.rendition} rendition.`,
  );
}

function embedAccessibilityMetadata(
  svg: SVGSVGElement,
  options: ProcessorOptions,
  prefix: string,
  messages: ValidationMessage[],
) {
  const title = options.title.trim();
  const description = options.description.trim();

  if (!title) {
    svg.removeAttribute("aria-labelledby");
    addMessage(
      messages,
      "error",
      "Accessible title is required before the SVG is ready for upload.",
    );
  } else {
    const titleId = `${prefix}-title`;
    const titleElement = svg.ownerDocument.createElementNS(
      "http://www.w3.org/2000/svg",
      "title",
    );

    titleElement.setAttribute("id", titleId);
    titleElement.textContent = title;
    svg.insertBefore(titleElement, svg.firstChild);
    svg.setAttribute("aria-labelledby", titleId);

    addMessage(messages, "ok", "Embedded accessible <title> metadata.");
  }

  if (!description) {
    svg.removeAttribute("aria-describedby");
    addMessage(
      messages,
      "error",
      "Accessible description is required before the SVG is ready for upload.",
    );
  } else {
    const descId = `${prefix}-description`;
    const descElement = svg.ownerDocument.createElementNS(
      "http://www.w3.org/2000/svg",
      "desc",
    );

    descElement.setAttribute("id", descId);
    descElement.textContent = description;

    const titleElement = svg.querySelector(":scope > title");
    if (titleElement?.nextSibling) {
      svg.insertBefore(descElement, titleElement.nextSibling);
    } else {
      svg.insertBefore(descElement, svg.firstChild);
      if (titleElement) {
        svg.insertBefore(titleElement, descElement);
      }
    }

    svg.setAttribute("aria-describedby", descId);

    addMessage(messages, "ok", "Embedded accessible <desc> metadata.");
  }
}

function inspectDuplicateIds(
  svg: SVGSVGElement,
  messages: ValidationMessage[],
) {
  const counts = new Map<string, number>();

  for (const element of svg.querySelectorAll("[id]")) {
    counts.set(element.id, (counts.get(element.id) || 0) + 1);
  }

  const duplicates = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id);

  if (duplicates.length) {
    addMessage(
      messages,
      "error",
      `Duplicate IDs already exist inside this SVG: ${duplicates.map((id) => `#${id}`).join(", ")}. These should be fixed at the source before production use.`,
    );
  }
}

function namespaceIds(
  svg: SVGSVGElement,
  prefix: string,
  messages: ValidationMessage[],
) {
  const idMap = new Map<string, string>();
  const idElements = [...svg.querySelectorAll("[id]")];

  for (const element of idElements) {
    const oldId = element.id;
    const newId = `${prefix}-${oldId}`;

    idMap.set(oldId, newId);
    element.id = newId;
  }

  if (!idMap.size) {
    addMessage(messages, "ok", "No internal IDs required namespacing.");
    return;
  }

  const all = [svg, ...svg.querySelectorAll("*")];

  for (const element of all) {
    for (const attribute of [...element.attributes]) {
      let value = attribute.value;
      let changed = false;

      for (const [oldId, newId] of idMap) {
        const urlPattern = new RegExp(
          `url\\(\\s*["']?#${escapeRegExp(oldId)}["']?\\s*\\)`,
          "g",
        );
        const hrefPattern = new RegExp(`^#${escapeRegExp(oldId)}$`);

        const urlUpdated = value.replace(urlPattern, `url(#${newId})`);
        if (urlUpdated !== value) {
          value = urlUpdated;
          changed = true;
        }

        const hrefUpdated = value.replace(hrefPattern, `#${newId}`);
        if (hrefUpdated !== value) {
          value = hrefUpdated;
          changed = true;
        }
      }

      if (changed) {
        element.setAttribute(attribute.name, value);
      }
    }
  }

  // Update url(#...) and simple #id selectors inside <style> blocks.
  for (const style of svg.querySelectorAll("style")) {
    let css = style.textContent || "";

    for (const [oldId, newId] of idMap) {
      css = css
        .replace(
          new RegExp(
            `url\\(\\s*["']?#${escapeRegExp(oldId)}["']?\\s*\\)`,
            "g",
          ),
          `url(#${newId})`,
        )
        .replace(
          new RegExp(`#${escapeRegExp(oldId)}(?=[\\s,{.:>+~\\[])`, "g"),
          `#${newId}`,
        );
    }

    style.textContent = css;
  }

  addMessage(
    messages,
    "ok",
    `Namespaced ${idMap.size} internal ID${idMap.size === 1 ? "" : "s"} and updated common references.`,
  );
}

function extractFontFamiliesFromValue(value: string) {
  return value
    .split(",")
    .map((font) =>
      font
        .trim()
        .replace(/^["']|["']$/g, "")
        .trim(),
    )
    .filter(Boolean);
}

function makeCaseInsensitiveMap(fontMap: Record<string, string>) {
  return new Map(
    Object.entries(fontMap).map(([source, target]) => [
      source.toLowerCase(),
      target,
    ]),
  );
}

function processFonts(
  svg: SVGSVGElement,
  options: ProcessorOptions,
  messages: ValidationMessage[],
) {
  const found = new Set<string>();
  const mapping = makeCaseInsensitiveMap(options.fontMap);
  const approved = new Set(
    options.approvedFonts.map((font) => font.toLowerCase()),
  );

  const mapFont = (font: string) => {
    found.add(font);
    return mapping.get(font.toLowerCase()) || font;
  };

  const all = [svg, ...svg.querySelectorAll("*")];

  for (const element of all) {
    const attr = element.getAttribute("font-family");

    if (attr) {
      const normalized = extractFontFamiliesFromValue(attr).map(mapFont);
      element.setAttribute("font-family", normalized.join(", "));
    }

    const style = element.getAttribute("style");

    if (style && /font-family\s*:/i.test(style)) {
      const updated = style.replace(
        /(font-family\s*:\s*)([^;]+)/gi,
        (_, lead: string, familyValue: string) => {
          const normalized = extractFontFamiliesFromValue(familyValue).map(mapFont);
          return `${lead}${normalized.join(", ")}`;
        },
      );

      element.setAttribute("style", updated);
    }
  }

  for (const style of svg.querySelectorAll("style")) {
    const css = style.textContent || "";

    style.textContent = css.replace(
      /(font-family\s*:\s*)([^;}]+)/gi,
      (_, lead: string, familyValue: string) => {
        const normalized = extractFontFamiliesFromValue(familyValue).map(mapFont);
        return `${lead}${normalized.join(", ")}`;
      },
    );
  }

  for (const font of found) {
    const mapped = mapping.get(font.toLowerCase()) || font;

    if (approved.has(mapped.toLowerCase())) {
      addMessage(
        messages,
        "ok",
        `Approved font: ${font}${mapped !== font ? ` → ${mapped}` : ""}`,
      );
    } else {
      addMessage(
        messages,
        "warning",
        `Unrecognized font family: "${font}". Add a mapping or verify that it is supported.`,
      );
    }
  }

  if (!found.size) {
    addMessage(
      messages,
      "warning",
      "No live font-family declarations found. Text may be outlined, inherited, or absent.",
    );
  }

  return [...found];
}

function inspectRasterImages(
  svg: SVGSVGElement,
  messages: ValidationMessage[],
) {
  const images = [...svg.querySelectorAll("image")];

  if (images.length) {
    addMessage(
      messages,
      "warning",
      `Found ${images.length} embedded or linked raster <image> element${images.length === 1 ? "" : "s"}.`,
    );
  }
}

function inspectBrokenReferences(
  svg: SVGSVGElement,
  messages: ValidationMessage[],
) {
  const ids = new Set([...svg.querySelectorAll("[id]")].map((el) => el.id));
  const refs = new Set<string>();
  const all = [svg, ...svg.querySelectorAll("*")];

  for (const element of all) {
    for (const attribute of [...element.attributes]) {
      for (const match of attribute.value.matchAll(
        /url\(\s*["']?#([^)"']+)["']?\s*\)/g,
      )) {
        refs.add(match[1]);
      }

      if (
        (attribute.name === "href" || attribute.name === "xlink:href") &&
        attribute.value.startsWith("#")
      ) {
        refs.add(attribute.value.slice(1));
      }
    }
  }

  for (const style of svg.querySelectorAll("style")) {
    for (const match of (style.textContent || "").matchAll(
      /url\(\s*["']?#([^)"']+)["']?\s*\)/g,
    )) {
      refs.add(match[1]);
    }
  }

  const broken = [...refs].filter((ref) => !ids.has(ref));

  if (broken.length) {
    addMessage(
      messages,
      "error",
      `Broken internal references: ${broken.map((id) => `#${id}`).join(", ")}`,
    );
  } else {
    addMessage(messages, "ok", "No broken internal ID references detected.");
  }
}

export function processSvg(
  source: string,
  filename: string,
  options: ProcessorOptions,
): ProcessedSvg {
  const messages: ValidationMessage[] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(source, "image/svg+xml");

  const parserError = doc.querySelector("parsererror");

  if (parserError) {
    return emptyResult(
      options.rendition,
      filename,
      source,
      "SVG XML could not be parsed.",
    );
  }

  const root = doc.documentElement;

  if (root.localName !== "svg") {
    return emptyResult(
      options.rendition,
      filename,
      source,
      "Uploaded file does not have an <svg> root element.",
    );
  }

  const svg = root as unknown as SVGSVGElement;
  const prefix = createPrefix(filename, options.rendition);

  sanitize(svg, messages);

  const parsedViewBox = ensureViewBox(svg, messages);
  const dimensions = ensureRootDimensions(svg, parsedViewBox, messages);

  normalizeRoot(svg, options, messages);

  inspectDuplicateIds(svg, messages);
  namespaceIds(svg, prefix, messages);
  embedAccessibilityMetadata(svg, options, prefix, messages);

  const fonts = processFonts(svg, options, messages);

  inspectRasterImages(svg, messages);
  inspectBrokenReferences(svg, messages);

  const serializer = new XMLSerializer();
  let output = serializer.serializeToString(svg);

  // XMLSerializer may prepend content in some browsers. Keep only the SVG root.
  if (!output.startsWith("<svg")) {
    const svgStart = output.indexOf("<svg");
    if (svgStart >= 0) output = output.slice(svgStart);
  }

  return {
    rendition: options.rendition,
    filename,
    source,
    output,
    previewMarkup: output,
    nativeWidth: dimensions.width,
    nativeHeight: dimensions.height,
    viewBox: svg.getAttribute("viewBox"),
    fonts,
    messages,
  };
}

function emptyResult(
  rendition: Rendition,
  filename: string,
  source: string,
  message: string,
): ProcessedSvg {
  return {
    rendition,
    filename,
    source,
    output: "",
    previewMarkup: "",
    nativeWidth: null,
    nativeHeight: null,
    viewBox: null,
    fonts: [],
    messages: [{ severity: "error", message }],
  };
}
