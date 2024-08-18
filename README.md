# conway-webgpu-electron

Conway's Game of Life w/ WebGPU in Electron. Made following [this great tutorial](https://codelabs.developers.google.com/your-first-webgpu-app#0).

## Project Setup

### Install
Use `pnpm` for package management

```bash
$ pnpm install
```

### Run
For the dev build:

```bash
$ pnpm dev
```

or
```bash
$ pnpm start
```

### Build

```bash
# For windows
$ pnpm build:win

# For macOS
$ pnpm build:mac

# For Linux
$ pnpm build:linux
```

## Why ...
### WebGPU?
It's cool new tech.

### Electron?
Just trying it out, no reason.

### not Tauri?
Tauri uses [`WebKitGTK`](https://webkitgtk.org/) for WebView on Linux, which currently does not to support WebGPU.

Electron uses Chromium which has support for it under the flag `enable-unsafe-webgpu` (+ `enable-features=Vulkan` on Linux).

## In the future
- [ ] Functioning controls
- [ ] User input
- [ ] Three dimensions :O
