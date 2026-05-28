# PhotoStars

**Local, private photo culling for photographers.** PhotoStars analyzes a folder
of photos — sharpness, exposure, eyes/expression, and aesthetic quality — derives
a star rating for each shot, and (on your confirmation) writes those ratings back
to the files so Lightroom, Capture One, and other editors pick them up.

Everything runs on your machine. No uploads, no cloud, no account.

---

## What it does

- **Fast triage of a whole shoot.** Point it at a folder; the grid paints
  instantly and scores stream in as each image is analyzed.
- **Multi-signal quality scoring:**
  - **Sharpness** — Laplacian-variance focus measure (with a separate
    face-region measure for portraits).
  - **Exposure** — histogram-based, flags under/over-exposed frames.
  - **Eyes & expression** — face landmark detection (eyes open/closed, smile,
    mouth, head tilt) via MediaPipe.
  - **Aesthetics** — a NIMA (Neural Image Assessment) deep model scoring overall
    visual quality 1–10.
- **Smart star derivation.** Per-feature scores are combined with tunable weights
  (portraits weight face sharpness higher), a power curve, hard caps for blurry
  shots, eyes-closed penalties, and burst-aware ranking so only the best frame in
  a burst gets the top slot.
- **Non-destructive rating write-back.** Writes XMP star ratings (and optional
  Lightroom labels) via ExifTool, with an opt-in `.bak` backup. RAW files get a
  sidecar `.xmp`; JPEG/HEIC are tagged in place.
- **RAW-aware.** Reads embedded previews for fast decode and honors orientation.

### Supported formats

- **RAW:** CR2/CR3, NEF/NRW, ARW/SR2/SRF, RAF, RW2, ORF, DNG, PEF, 3FR, ERF,
  MEF, MOS, IIQ, RWL, and more.
- **JPEG:** JPG/JPEG/JPE
- **HEIC/HEIF**

---

## Install

PhotoStars is an Electron desktop app. There are two ways to get it running:
**from source** (for development) or **as a packaged installer**.

### Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| [Node.js](https://nodejs.org/) | ≥ 20 | Runtime for Electron + build tooling |
| [pnpm](https://pnpm.io/) | 11.x | `corepack enable` then `corepack prepare pnpm@11.2.2 --activate` |
| [uv](https://docs.astral.sh/uv/) | latest | Provisions the Python sidecar. Auto-installed at runtime if missing; required at build time to generate the aesthetics model. |

> **You do not need to install Python yourself.** PhotoStars uses `uv` to
> download a pinned Python 3.12 and create an isolated environment for its
> analysis sidecar. The first launch does this automatically.

### Run from source

```bash
git clone <repo-url> PhotoStars
cd PhotoStars
pnpm install
pnpm dev
```

`pnpm dev` builds the main + renderer processes, watches for changes, and opens
the app. **On first launch** the app provisions its Python sidecar — watch the
terminal for:

```
[sidecar-setup] creating venv + installing deps (first run, may take a few minutes)
[sidecar] spawning N worker(s): ...sidecar-venv...python ...analyzer.py
```

This is a one-time step (downloads uv if needed, Python 3.12, and
opencv/mediapipe/onnxruntime/numpy into an isolated venv under your user data
dir). Subsequent launches start instantly.

### Build the analysis model

The aesthetics model (`nima.onnx`) and the face-landmark model
(`face_landmarker.task`) are **not committed to the repo** — they are generated
locally so the binaries stay out of git. The build does this for you:

```bash
pnpm prepare:models   # downloads + converts the NIMA checkpoint and landmarker model
```

This runs automatically as part of `pnpm build`. It uses `uv` to spin up an
ephemeral environment with PyTorch, convert the published NIMA MobileNetV2
checkpoint to a single self-contained `nima.onnx`, and download the MediaPipe
face landmarker. The heavyweight PyTorch install lives only in that throwaway
environment — it never ships to end users.

### Build a distributable installer

```bash
pnpm dist          # full installer for the current OS (NSIS / dmg / AppImage)
pnpm pack          # unpacked app dir, for quick local testing
```

Installers are written to `release/`. Builds are per-platform: build the Windows
installer on Windows, macOS on macOS, Linux on Linux (or in CI).

> **First launch of a packaged app** behaves like dev: it provisions the Python
> sidecar once (needs internet that one time), then runs fully locally
> thereafter. The model files are bundled in the installer.

---

## Using it

1. **Open a folder** of photos.
2. The grid fills immediately; **scores stream in** per image (sharpness,
   exposure, eyes, aesthetics, and a derived star rating).
3. Review and adjust. Use the detail view to zoom and inspect.
4. **Confirm** to write ratings back to the files (with optional `.bak` backup).
   Open the folder in Lightroom/Capture One and your stars are there.

---

## How it works

```
Folder ──> scan ──> preview (sharp / embedded RAW preview)
                       │
                       ├─ sharpness (Laplacian variance)        [Node]
                       ├─ exposure  (histogram)                 [Node]
                       └─ sidecar request ──────────────► Python analyzer
                                                            ├─ MediaPipe face landmarks
                                                            └─ NIMA ONNX aesthetics
                       │
                       ▼
              weighted quality ──> star derivation ──> (confirm) ──> ExifTool XMP write
```

- **Main process (TypeScript/Electron):** orchestration, image decode (`sharp`),
  sharpness/exposure math, scoring, and rating write-back via
  `exiftool-vendored`.
- **Sidecar (Python):** a small JSON-lines worker pool (`analyzer.py`) doing face
  landmarks (MediaPipe) and aesthetic scoring (NIMA via ONNX Runtime). Managed
  automatically — provisioned with `uv`, pooled across CPU cores.
- **Renderer (React + Zustand + Tailwind):** the grid, detail view, and review UI.

### Tuning the scoring

Weights and thresholds live in `src/main/scoring.config.json`:

```jsonc
{
  "weights":         { "sharpness": 0.45, "exposure": 0.35, "aesthetics": 0.20 },
  "portraitWeights": { "sharpness": 0.65, "exposure": 0.10, "aesthetics": 0.25 },
  "qualityPower": 1.8,          // higher = harsher; pushes more shots toward 0–2★
  "hardCaps": {
    "blurryVariance": 50,       // below this, capped at blurryMaxStars
    "blurryMaxStars": 2,
    "closedEyesPenalty": 1      // stars subtracted when eyes closed / bad expression
  },
  "sharpness": { "floor": 50, "ceil": 600 }  // variance range mapped to 0–1
}
```

---

## Troubleshooting

- **No aesthetics/face scores; logs say sidecar setup failed.** The first-run
  provisioning needs internet (to fetch uv, Python, and pip packages). Re-launch
  to retry. You can also pre-build the env manually with `uv venv --python 3.12`
  + `uv pip install -r src/main/sidecar/requirements.txt`.
- **`pnpm prepare:models` can't find uv.** Install uv
  (`https://docs.astral.sh/uv/`) and ensure it's on `PATH` or in `~/.local/bin`.
- **Aesthetics required:** there is no heuristic fallback — if `nima.onnx` is
  missing the aesthetics request errors (the app keeps working, that image just
  gets no aesthetic score). Run `pnpm prepare:models` to (re)generate it.
- **Ratings didn't appear in my editor.** RAW files get a sidecar `.xmp`
  alongside the original; make sure your editor reads XMP sidecars.

---

## Tech stack

Electron · React 19 · TypeScript · Zustand · Tailwind · `sharp` ·
`exiftool-vendored` · Python sidecar (MediaPipe · ONNX Runtime · OpenCV) ·
NIMA (MobileNetV2) · `uv`

## License

MIT
