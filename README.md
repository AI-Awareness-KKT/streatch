# Stretch

A browser webcam playground with hand-controlled head and face effects.

## Publish on GitHub Pages

1. Create a repository named `gum-gum-funny-face` on GitHub. For GitHub Free, use a **public** repository.
2. Extract this ZIP completely.
3. Upload the **contents** of this extracted project folder into the repository root. Keep the `docs` folder intact. Do not upload the ZIP itself or put the project inside another folder.
4. Commit the upload to the `main` branch.
5. Open the repository's **Settings > Pages**.
6. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
7. Select branch **main** and folder **/docs**, then click **Save**.
8. Wait for the Pages deployment to finish. Open the URL shown in Settings > Pages.
9. Open the HTTPS site in its own browser tab, click **Start camera**, and allow access.

The published site and its files will be publicly accessible with this setup.
The app processes webcam frames locally and does not upload or record video.

No Python server, npm build, API key, or database is needed on GitHub Pages.
The tracking code and model assets are included in `docs/vendor/`.
All app asset URLs are relative, so the app also works under a repository URL path.

If Pages displays a 404, confirm that `docs/index.html` is at the repository root's
`docs` folder, and that Pages is set to `main` + `/docs`.
If the camera is blocked, allow it for the published HTTPS site and open it outside
an embedded preview. WebGL/hardware acceleration is required for tracking.

## Run locally

Install Python 3. On Windows, double-click `start.bat`.
On macOS/Linux, run `python3 start.py` from this folder.
Open `http://localhost:8000` and keep the terminal window open.
No pip or npm installation is required to run the app.

## Features

- Stretch, Inflate, Shrink and Twist using up to two tracked hands.
- Whole-head or face-only selection, adjustable head coverage and left/right outline alignment.
- Multiple saved effects with Keep shape, Undo last and Reset face.
- Automatic guide hiding after editing starts.
- Big head preset, original comparison and clean PNG photo export.
- Mouse/touch illustration demo without webcam access.

The head outline is estimated from facial landmarks. Keep the whole head in the
camera frame, and adjust coverage/alignment for your hairstyle.

## Source files

- `docs/index.html`: interface and styling.
- `docs/app.mjs`: camera, tracking, interaction and photo export.
- `docs/face-engine.mjs`: gestures, head geometry and image warping.
- `docs/face-demo.mjs`: interactive illustrated demo.
- `docs/engine.mjs`: retained original hand-tube effect math.
- `docs/vendor/`: bundled MediaPipe JavaScript, WASM and model assets.
- `tests/face-engine.test.mjs`: 17 regression tests.

## Optional tests

With Node.js 20 or later, run:

```sh
npm test
```

There are no npm dependencies to install.
The demo, effect logic and photo export have been checked. Live webcam tracking
must be verified on your device.

## Third-party assets

MediaPipe Tasks Vision 0.10.32, Apache 2.0: see `docs/vendor/LICENSE`.
Bundled Hand Landmarker and Face Landmarker models are from Google's MediaPipe distribution.

## Hosting reference

[GitHub Pages publishing source documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
