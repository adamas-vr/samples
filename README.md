# Adamas VR Samples

This repository contains sample projects for building VR experiences on the Adamas platform using the Adamas VR TypeScript SDK.

The Adamas project provides an API for building VR projects that run on the Adamas platform. The SDK is published to npm as a TypeScript package and is available on GitHub at [adamas-vr/runtime-interface](https://github.com/adamas-vr/runtime-interface). The API includes common game engine features such as rendering and physics, along with VR-specific APIs for interaction, users, and devices. The platform also includes built-in multiplayer features for state synchronization.

- SDK repository: [https://github.com/adamas-vr/runtime-interface](https://github.com/adamas-vr/runtime-interface)
- Documentation: [https://docs.adamasvr.com/](https://docs.adamasvr.com/)

## Install

Install the core SDK with npm:

```bash
npm install @adamasvr/sdk
```

Some samples in this repo also use the Adamas ImGui package for in-world UI:

```bash
npm install @adamasvr/imgui
```

## Samples

## camera

Folder: [camera](./camera)

A handheld Polaroid-style camera sample. It renders a camera view to a texture, shows a live preview on the device, captures a JPG when the camera is activated, and spawns a grabbable photo in the world. It also demonstrates optional multiplayer synchronization for spawned photos and grab interactions.

## defaultScene

Folder: [defaultScene](./defaultScene)

A minimal starter project built around a furnished default environment scene. The TypeScript entrypoint is intentionally empty, so this sample is mainly useful as a baseline project structure and scene setup for new Adamas experiences.

## device

Folder: [device](./device)

A controller input visualization sample. It attaches left and right controller models to the local user’s hands, reads device values from the Adamas device API, highlights buttons when pressed, rotates thumbsticks based on axis input, and animates grips and triggers.

## interaction

Folder: [interaction](./interaction)

A basic interaction and physics sample focused on grab, hover, activate, trigger, and collision events. It uses synchronized networking variables to reflect hover/select/activate states in multiplayer and changes object materials when trigger or collision callbacks fire.

## pen

Folder: [pen](./pen)

A networked 3D drawing sample. It generates tube meshes from tracked pen tip positions, updates the mesh in real time, and synchronizes stroke data across clients so drawings can be shared in multiplayer sessions.

## rendering

Folder: [rendering](./rendering)

A rendering showcase project containing several scene-based material and asset tests, including alpha blend mode, texture coordinate behavior, texture settings, normal/tangent validation, metallic-roughness shading, and imported reference assets like the Flight Helmet and Water Bottle models. The script is minimal, so the value here is in the prepared rendering test scenes and assets.

## rpcBenchmark

Folder: [rpcBenchmark](./rpcBenchmark)

An in-world benchmarking tool for measuring SDK RPC behavior. It creates an ImGui control panel and runs latency, throughput, and single-upload timing tests using transform updates and texture uploads, then plots results and logs benchmark status in VR.

## uiSample

Folder: [uiSample](./uiSample)

A simple in-world UI sample built with `@adamasvr/imgui`. It creates a VR panel that shows framerate information and a color editor, then synchronizes the selected cube color across clients using a networked variable.

## virtualDesktop

Folder: [virtualDesktop](./virtualDesktop)

A virtual desktop streaming prototype. It captures the host machine desktop, compresses and uploads frames into a texture, displays the screen in VR, tracks controller input for cursor interaction, and includes performance instrumentation for capture timing and payload throughput.
