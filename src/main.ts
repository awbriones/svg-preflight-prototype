import "./styles.css";

import {
  APPROVED_FONTS,
  BREAKPOINTS,
  FONT_MAP,
  MIN_PREVIEW_WIDTH,
} from "./config";
import { processSvg } from "./svgProcessor";
import type { ProcessedSvg, Rendition } from "./types";

const renditions: Rendition[] = ["small", "medium", "large"];

type AppState = {
  title: string;
  description: string;
  widthMode: "fill" | "fixed";
  previewWidth: number;
  results: Partial<Record<Rendition, ProcessedSvg>>;
  rawFiles: Partial<Record<Rendition, { filename: string; source: string }>>;
};

const state: AppState = {
  title: "",
  description: "",
  widthMode: "fill",
  previewWidth: 960,
  results: {},
  rawFiles: {},
};

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <main class="page-shell">
    <header class="page-header">
      <div>
        <p class="eyebrow">Prototype utility</p>
        <h1>SVG Preflight</h1>
        <p class="lede">
          Prepare responsive SVG renditions for AEM: preserve intrinsic dimensions,
          add rendition metadata, namespace IDs, validate fonts, preview responsive
          behavior, and export cleaned SVG assets.
        </p>
        <p class="header-note">
          This preflight prototype assumes the same accessible title and description will
          be embedded directly in each Small, Medium, and Large SVG asset.
        </p>
      </div>
    </header>

    <section class="panel" aria-labelledby="content-heading">
      <div class="section-heading">
        <div>
          <p class="section-kicker">1</p>
          <h2 id="content-heading">Accessible content</h2>
        </div>
        <p class="section-note">
          These values are repeated in every prepared SVG rendition.
        </p>
      </div>

      <div class="field-grid">
        <label class="field">
          <span>Title</span>
          <input
            id="titleInput"
            type="text"
            placeholder="Why it pays to start early"
          />
        </label>

        <label class="field field--wide">
          <span>Description</span>
          <textarea
            id="descriptionInput"
            rows="5"
            aria-describedby="descriptionHelper"
            placeholder="Describe the meaningful visual information conveyed by the SVG."
          ></textarea>
          <span class="field__helper" id="descriptionHelper">
            Tip: Try uploading a screenshot of your SVG to Copilot and ask for an accessible text description of the visual content. Then double-check it for accuracy. 
          </span>
        </label>
      </div>
    </section>

    <section class="panel" aria-labelledby="upload-heading">
      <div class="section-heading">
        <div>
          <p class="section-kicker">2</p>
          <h2 id="upload-heading">Upload renditions</h2>
        </div>
        <p class="section-note">
          Small is the required baseline. Medium and Large are optional for the prototype.
        </p>
      </div>

      <div class="upload-grid">
        ${renditions
          .map(
            (rendition) => `
              <article class="upload-card" data-rendition-card="${rendition}">
                <div class="upload-card__header">
                  <div>
                    <h3>${capitalize(rendition)}</h3>
                    <p>${rangeLabel(rendition)}</p>
                  </div>
                  <span class="status-pill" data-status="${rendition}">Waiting</span>
                </div>

                <label class="drop-zone" data-drop-zone="${rendition}">
                  <input
                    type="file"
                    accept=".svg,image/svg+xml"
                    data-file-input="${rendition}"
                  />
                  <span class="drop-zone__primary">Drop SVG here</span>
                  <span class="drop-zone__secondary">or click to choose a file</span>
                </label>

                <div class="file-meta" data-file-meta="${rendition}" hidden></div>
                <div class="validation-list" data-validation="${rendition}"></div>

                <div class="card-actions">
                  <button
                    class="button button--secondary"
                    type="button"
                    data-download="${rendition}"
                    disabled
                  >
                    Download prepared SVG
                  </button>
                </div>
              </article>
            `,
          )
          .join("")}
      </div>
    </section>

    <section class="panel" aria-labelledby="preview-heading">
      <div class="section-heading section-heading--preview">
        <div>
          <p class="section-kicker">3</p>
          <h2 id="preview-heading">Responsive preview</h2>
        </div>

        <div class="width-mode-control" data-width-mode="fill">
          <span class="width-mode-label" data-mode-label="fixed">Fixed width</span>
          <label class="switch">
            <input
              id="widthModeToggle"
              type="checkbox"
              role="switch"
              checked
              aria-label="SVG sizing mode: Fill width"
            />
            <span class="switch__track" aria-hidden="true"></span>
          </label>
          <span class="width-mode-label is-active" data-mode-label="fill">Fill width</span>
        </div>
      </div>

      <div class="preview-controls">
        <div class="preview-track-wrap">
          <div class="preview-track" id="previewTrack">
            <div class="preview-track__line" aria-hidden="true"></div>
            <div class="preview-track__start" aria-hidden="true"></div>
            <div class="preview-track__active" aria-hidden="true"></div>

            <div class="preview-track__label" id="previewSizeLabel" aria-hidden="true">
              Container Size: Medium
            </div>

            <input
              id="previewRange"
              type="range"
              min="${MIN_PREVIEW_WIDTH}"
              max="1280"
              value="960"
              step="1"
              aria-label="Preview container width"
            />
          </div>
        </div>

        <div class="preview-readout">
          <span id="previewPx">960px</span>
          <span id="previewRendition">Medium rendition</span>
        </div>
      </div>

      <div class="preview-stage" id="previewStage">
        <div class="preview-container" id="previewContainer">
          <div class="preview-empty" id="previewEmpty">
            Upload at least one SVG rendition to preview it here.
          </div>
          <div id="previewGraphic"></div>
        </div>
      </div>
    </section>

    <section class="panel" aria-labelledby="output-heading">
      <div class="section-heading">
        <div>
          <p class="section-kicker">4</p>
          <h2 id="output-heading">Prepared markup</h2>
        </div>
      </div>

      <div class="output-toolbar">
        <label>
          <span class="sr-only">Choose rendition to inspect</span>
          <select id="outputSelect">
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </select>
        </label>
        <button class="button button--secondary" type="button" id="copyMarkup" disabled>
          Copy markup
        </button>
      </div>

      <pre class="code-output"><code id="outputCode">Upload an SVG to inspect prepared markup.</code></pre>
    </section>

    <footer class="page-footer">
      Prototype note: this is a client-side preflight utility, not a production security boundary.
      AEM should still validate SVG uploads and add a per-component-instance ID prefix when
      rendering reused assets so embedded title, description, mask, gradient, clip-path, and other IDs remain unique.
    </footer>
  </main>
`;

const titleInput = get<HTMLInputElement>("#titleInput");
const descriptionInput = get<HTMLTextAreaElement>("#descriptionInput");
const widthModeToggle = get<HTMLInputElement>("#widthModeToggle");
const previewRange = get<HTMLInputElement>("#previewRange");
const previewStage = get<HTMLDivElement>("#previewStage");
const previewTrack = get<HTMLDivElement>("#previewTrack");
const previewContainer = get<HTMLDivElement>("#previewContainer");
const previewGraphic = get<HTMLDivElement>("#previewGraphic");
const previewEmpty = get<HTMLDivElement>("#previewEmpty");
const previewPx = get<HTMLSpanElement>("#previewPx");
const previewRendition = get<HTMLSpanElement>("#previewRendition");
const previewSizeLabel = get<HTMLDivElement>("#previewSizeLabel");
const outputSelect = get<HTMLSelectElement>("#outputSelect");
const outputCode = get<HTMLElement>("#outputCode");
const copyMarkup = get<HTMLButtonElement>("#copyMarkup");

for (const rendition of renditions) {
  const input = get<HTMLInputElement>(`[data-file-input="${rendition}"]`);
  const dropZone = get<HTMLElement>(`[data-drop-zone="${rendition}"]`);

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (file) await handleFile(rendition, file);
  });

  for (const eventName of ["dragenter", "dragover"]) {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.add("is-dragging");
    });
  }

  for (const eventName of ["dragleave", "drop"]) {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.remove("is-dragging");
    });
  }

  dropZone.addEventListener("drop", async (event: DragEvent) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) await handleFile(rendition, file);
  });

  get<HTMLButtonElement>(`[data-download="${rendition}"]`).addEventListener(
    "click",
    () => downloadRendition(rendition),
  );
}

titleInput.addEventListener("input", () => {
  state.title = titleInput.value;
  reprocessAll();
});

descriptionInput.addEventListener("input", () => {
  state.description = descriptionInput.value;
  reprocessAll();
});

widthModeToggle.addEventListener("change", () => {
  state.widthMode = widthModeToggle.checked ? "fill" : "fixed";
  updateWidthModeUi();
  renderPreview();
});

previewRange.addEventListener("input", () => {
  state.previewWidth = Number(previewRange.value);
  renderPreview();
});

outputSelect.addEventListener("change", renderOutputCode);

copyMarkup.addEventListener("click", async () => {
  const rendition = outputSelect.value as Rendition;
  const output = state.results[rendition]?.output;
  if (!output) return;

  await navigator.clipboard.writeText(output);
  copyMarkup.textContent = "Copied";

  window.setTimeout(() => {
    copyMarkup.textContent = "Copy markup";
  }, 1200);
});

window.addEventListener("resize", updatePreviewRangeMax);

updatePreviewRangeMax();
updateWidthModeUi();
renderPreview();
renderOutputCode();

async function handleFile(rendition: Rendition, file: File) {
  if (
    !file.name.toLowerCase().endsWith(".svg") &&
    file.type !== "image/svg+xml"
  ) {
    renderStandaloneMessage(rendition, "error", "Choose an SVG file.");
    return;
  }

  const source = await file.text();

  state.rawFiles[rendition] = {
    filename: file.name,
    source,
  };

  processRendition(rendition);
  renderPreview();
  renderOutputCode();
}

function processRendition(rendition: Rendition) {
  const raw = state.rawFiles[rendition];
  if (!raw) return;

  const result = processSvg(raw.source, raw.filename, {
    rendition,
    title: state.title,
    description: state.description,
    approvedFonts: APPROVED_FONTS,
    fontMap: FONT_MAP,
  });

  state.results[rendition] = result;
  renderResultCard(rendition, result);
}

function reprocessAll() {
  for (const rendition of renditions) {
    if (state.rawFiles[rendition]) {
      processRendition(rendition);
    }
  }

  renderPreview();
  renderOutputCode();
}

function renderResultCard(rendition: Rendition, result: ProcessedSvg) {
  const status = get<HTMLElement>(`[data-status="${rendition}"]`);
  const meta = get<HTMLElement>(`[data-file-meta="${rendition}"]`);
  const validation = get<HTMLElement>(`[data-validation="${rendition}"]`);
  const download = get<HTMLButtonElement>(`[data-download="${rendition}"]`);

  const hasErrors = result.messages.some(
    (message) => message.severity === "error",
  );
  const hasWarnings = result.messages.some(
    (message) => message.severity === "warning",
  );

  status.textContent = hasErrors
    ? "Needs review"
    : hasWarnings
      ? "Ready with warnings"
      : "Ready";
  status.dataset.kind = hasErrors ? "error" : hasWarnings ? "warning" : "ok";

  meta.hidden = false;
  meta.innerHTML = `
    <strong>${escapeHtml(result.filename)}</strong>
    <span>${result.viewBox ? `viewBox ${escapeHtml(result.viewBox)}` : "No usable viewBox"}</span>
    ${
      result.nativeWidth && result.nativeHeight
        ? `<span>Root size ${formatNumber(result.nativeWidth)} × ${formatNumber(result.nativeHeight)}</span>`
        : ""
    }
  `;

  validation.innerHTML = result.messages
    .map(
      (message) => `
        <div class="validation-item validation-item--${message.severity}">
          <span class="validation-icon" aria-hidden="true">${iconFor(message.severity)}</span>
          <span>${escapeHtml(message.message)}</span>
        </div>
      `,
    )
    .join("");

  download.disabled = !result.output;
}

function renderStandaloneMessage(
  rendition: Rendition,
  severity: "warning" | "error",
  message: string,
) {
  const validation = get<HTMLElement>(`[data-validation="${rendition}"]`);

  validation.innerHTML = `
    <div class="validation-item validation-item--${severity}">
      <span class="validation-icon" aria-hidden="true">${iconFor(severity)}</span>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}

function renderPreview() {
  const width = state.previewWidth;
  const activeRendition = renditionForWidth(width);
  const result = bestAvailableResult(activeRendition);

  previewContainer.style.width = `${width}px`;
  previewTrack.style.setProperty("--preview-width", `${width}px`);

  previewPx.textContent = `${Math.round(width)}px`;
  previewRendition.textContent = `${capitalize(activeRendition)} rendition`;
  previewSizeLabel.textContent = `Container Size: ${capitalize(activeRendition)}`;

  previewRange.setAttribute(
    "aria-valuetext",
    `${Math.round(width)} pixels, ${capitalize(activeRendition)} container`,
  );

  if (!result?.previewMarkup) {
    previewEmpty.hidden = false;
    previewGraphic.innerHTML = "";
    return;
  }

  previewEmpty.hidden = true;
  previewGraphic.innerHTML = result.previewMarkup;

  const svg = previewGraphic.querySelector<SVGSVGElement>("svg");
  if (!svg) return;

  // Mirror the current component CSS without changing the serialized output.
  svg.style.display = "block";
  svg.style.height = "auto";

  if (state.widthMode === "fixed") {
    // Fixed mode relies on the preserved root width/height attributes.
    svg.style.width = "";
    svg.style.maxWidth = "100%";
    svg.style.marginInline = "auto";
  } else {
    // Fill mode intentionally overrides the intrinsic root width.
    svg.style.width = "100%";
    svg.style.maxWidth = "none";
    svg.style.marginInline = "0";
  }
}

function bestAvailableResult(target: Rendition) {
  if (state.results[target]) return state.results[target];

  // Prototype fallback mirrors the intended authoring behavior:
  // large -> medium -> small; medium -> small.
  if (target === "large") {
    return state.results.medium || state.results.small;
  }

  if (target === "medium") {
    return state.results.small || state.results.large;
  }

  return state.results.small || state.results.medium || state.results.large;
}

function renderOutputCode() {
  const rendition = outputSelect.value as Rendition;
  const output = state.results[rendition]?.output;

  outputCode.textContent = output || "Upload an SVG to inspect prepared markup.";
  copyMarkup.disabled = !output;
}

function updateWidthModeUi() {
  const control = document.querySelector<HTMLElement>(".width-mode-control")!;
  control.dataset.widthMode = state.widthMode;

  for (const label of control.querySelectorAll<HTMLElement>("[data-mode-label]")) {
    label.classList.toggle(
      "is-active",
      label.dataset.modeLabel === state.widthMode,
    );
  }

  widthModeToggle.setAttribute(
    "aria-label",
    `SVG sizing mode: ${state.widthMode === "fill" ? "Fill width" : "Fixed width"}`,
  );
}

function updatePreviewRangeMax() {
  const stageWidth = Math.max(
    MIN_PREVIEW_WIDTH,
    Math.floor(previewStage.clientWidth),
  );

  previewRange.min = String(MIN_PREVIEW_WIDTH);
  previewRange.max = String(stageWidth);

  if (state.previewWidth > stageWidth) {
    state.previewWidth = stageWidth;
  }

  if (state.previewWidth < MIN_PREVIEW_WIDTH) {
    state.previewWidth = MIN_PREVIEW_WIDTH;
  }

  previewRange.value = String(state.previewWidth);
  renderPreview();
}

function renditionForWidth(width: number): Rendition {
  if (width >= BREAKPOINTS.large) return "large";
  if (width >= BREAKPOINTS.medium) return "medium";
  return "small";
}

function downloadRendition(rendition: Rendition) {
  const result = state.results[rendition];
  if (!result?.output) return;

  const blob = new Blob([result.output], {
    type: "image/svg+xml;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  const base = result.filename.replace(/\.svg$/i, "");
  anchor.href = url;
  anchor.download = `${base}-${rendition}-prepared.svg`;
  anchor.click();

  URL.revokeObjectURL(url);
}

function rangeLabel(rendition: Rendition) {
  if (rendition === "small") return "320–639px container";
  if (rendition === "medium") return "640–1087px container";
  return "1088px+ container";
}

function iconFor(severity: "ok" | "warning" | "error") {
  if (severity === "ok") return "✓";
  if (severity === "warning") return "!";
  return "×";
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function get<T extends Element>(selector: string) {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }

  return element;
}

function escapeHtml(value: string) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}
