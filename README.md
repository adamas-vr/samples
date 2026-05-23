# Adamas VR Samples

This repository contains sample projects for building VR experiences on the Adamas platform using the Adamas VR TypeScript SDK.

Adamas provides a TypeScript API for building VR applications that run on the Adamas platform. The SDK is published on npm and is available on GitHub at [adamas-vr/runtime-interface](https://github.com/adamas-vr/runtime-interface). The API includes core engine capabilities such as rendering and physics, in addition to VR-specific systems for interaction, users, and devices. The platform also provides built-in multiplayer support for state synchronization.


Adamas projects follow a standard Node.js and TypeScript project structure. In addition, each project includes a `.adamas` directory that integrates the codebase with the Adamas Hub visual editor. This enables 3D scene editing and entity-component authoring workflows alongside conventional TypeScript development.

- SDK repository: [https://github.com/adamas-vr/runtime-interface](https://github.com/adamas-vr/runtime-interface)
- Documentation: [https://docs.adamasvr.com/](https://docs.adamasvr.com/)
- Adamas Hub download: [https://www.adamasvr.com/](https://www.adamasvr.com/)

## Dependent Packages and Installation

These samples depend on the core Adamas SDK, [`@adamasvr/sdk`](https://www.npmjs.com/package/@adamasvr/sdk), which is publicly available on npm. Some samples also depend on [`@adamasvr/imgui`](https://www.npmjs.com/package/@adamasvr/imgui), a Dear ImGui package with a custom backend for the Adamas platform.


To install dependencies, run:

```bash
npm install 
```

## Opening a Sample Project

Each sample can be opened directly in Visual Studio Code as an individual Node.js and TypeScript project for coding.

For a more complete Adamas VR development workflow, use Adamas Hub, available from the [Adamas Hub download page](https://www.adamasvr.com/). To author scenes and manage assets with the Adamas 3D editor, open an individual sample project folder in Adamas Hub. The editor reads the `.adamas` metadata within each sample and enables scene editing and asset workflows on top of the same source tree used for TypeScript development.

### Important Notice

These samples are provided exclusively to demonstrate Adamas API usage and common implementation patterns used in Adamas projects. They should be regarded as instructional references and tutorials rather than production-ready applications. No guarantees are provided with respect to performance, stability, or suitability for production deployment.

Developers are welcome to fork, modify, and distribute these samples for either public or private use. Pull requests and suggestions for improvement are also welcome.

## Virtual Camera

Folder: [camera](./camera)

This sample implements a handheld Polaroid-style camera. It renders a camera view to a texture, displays a live preview on the device, captures a JPG when the camera is activated, and spawns a grabbable photo in the scene. It also demonstrates multiplayer grabbing and interaction behavior.

## Home Space

Folder: [defaultScene](./defaultScene)

This sample is the default world project loaded when launching the Adamas platform. It is built entirely with Project Studio in Adamas Hub and does not require any TypeScript code. The sample demonstrates a no-code VR world creation workflow on Adamas using the visual editor alone.

## Controller Visualization

Folder: [device](./device)

This sample visualizes controller input by attaching left and right controller models to the local user’s hands. It reads values from the Adamas device API, highlights buttons when pressed, rotates thumbsticks based on axis input, and animates grips and triggers. The controller representations are not network-synchronized and appear only to the local user, making this sample a useful reference for device API usage and for features intended to affect only local user state.

## Interaction

Folder: [interaction](./interaction)

This sample demonstrates interaction and physics workflows centered on grab, hover, activate, trigger, and collision events. It uses synchronized networking variables to reflect hover, select, and activate states in multiplayer sessions, and it updates object materials when trigger or collision callbacks fire. The project serves as a reference for implementing core VR interactions as well as shared multi-user behavior on the Adamas platform.

## Spatial Pen

Folder: [pen](./pen)

This sample implements a networked 3D drawing tool. It generates tube meshes from tracked pen tip positions, updates the mesh in real time, and synchronizes stroke data across clients so drawings can be shared in multiplayer sessions. It demonstrates how multiplayer functionality can be introduced into an Adamas project through the platform networking APIs without requiring developers to manage underlying multiplayer infrastructure directly.

## Rendering

Folder: [rendering](./rendering)

This sample is a rendering showcase containing several scene-based material and asset tests, including alpha blend mode, texture coordinate behavior, texture settings, normal and tangent validation, metallic-roughness shading, and imported reference assets such as the Flight Helmet and Water Bottle models. It serves as a reference for evaluating rendering features on Adamas and also demonstrates content authoring workflows that can be completed in Project Studio on Adamas Hub without additional scripting.


## ImGui UI Sample

Folder: [uiSample](./uiSample)

This sample demonstrates a simple in-world UI built with [`@adamasvr/imgui`](https://www.npmjs.com/package/@adamasvr/imgui). It creates a VR panel that displays framerate information and a color editor, then synchronizes the selected cube color across clients using a networked variable.

The UI package is built on top of the Adamas platform and is consumed as a standard dependency within a Node.js project. This sample demonstrates that Adamas VR projects can fully leverage the broader Node.js and TypeScript ecosystem, and that packages built on top of Adamas APIs can be developed, versioned, and reused in the same manner as conventional Node.js packages.


## RPC Benchmark

Folder: [rpcBenchmark](./rpcBenchmark)

This sample provides an in-world benchmarking tool for measuring the SDK’s internal RPC behavior when interfacing with the platform runtime. It is a comparatively technical sample intended for profiling RPC latency, throughput, and upload performance, and may be less relevant for developers who are new to the platform.

The sample creates an ImGui control panel and runs latency, throughput, and single-upload timing tests using transform updates and texture uploads, then plots results and logs benchmark status in VR.

## Virtual Desktop

Folder: [virtualDesktop](./virtualDesktop)

This sample demonstrates a virtual desktop streaming workflow. It captures the host machine desktop, compresses and uploads frames into a texture, displays the resulting screen in VR, tracks controller input for cursor interaction, and includes performance instrumentation for capture timing and payload throughput.

This project uses a more advanced build workflow than the other samples and relies on platform-native libraries for GPU-based screen capture. At present, it is supported only on Windows and depends on the custom `robotjs` package available at [adamas-vr/robotjs](https://github.com/adamas-vr/robotjs).

### Virtual Desktop Build Notes

This sample requires additional setup beyond the standard sample workflow:

1. Clone the `robotjs` repository into the same parent directory as this repository.
2. Run `npm install` from the [`virtualDesktop`](./virtualDesktop) project directory.
3. In Adamas Hub -> Project Studio -> Build, open the advanced build settings, add `robotjs` as an external package, and then run the build.

For deployment on the Adamas platform, create a `node_modules` directory inside `./virtualDesktop/dist` and copy the `robotjs` package into that directory. This step is required because `robotjs` produces a OS-native binary that must be distributed together with the Adamas project build.
