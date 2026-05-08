# Adamas VR Project Notes

This is a general handoff for working on an Adamas VR project. The main runtime
entry is usually `index.ts`, with generated output under `dist/`. Runtime code
typically uses `@adamasvr/sdk` plus project-specific math, interaction, and
asset utilities.

## Project Metadata

- `.adamas/project.json`: source of project metadata, world settings, scene
  entities, transforms, renderables, and component data.
- `.adamas/generated.d.ts`: generated TypeScript scene graph typing. Use this
  file to find valid `sceneGraph[...]` paths instead of guessing entity names.
- `.adamas/asset-record.json`: maps Adamas asset ids to local asset files.
- `*.amesh`: local mesh assets.
- `*.amat`: local material assets.
- `package.json`: SDK, TypeScript, and project dependency declarations.

## Current Runtime Flow

- `Project.FromBundle(projectBundle).Launch(...)` starts the project runtime.
- `OnSetup` is the right place to read the generated scene graph, cache entity
  ids, fetch existing materials/meshes, prepare reusable runtime objects, and
  register interaction callbacks.
- `OnTick` is the per-frame update path. Keep it small and avoid expensive
  awaited work when possible.
- SDK managers such as `EntityManager`, `TransformManager`,
  `RenderableManager`, `MeshManager`, and interaction managers are commonly used
  to create/update runtime scene objects.

## Async Race Issues To Avoid

Do not assume global state is unchanged after `await`. Any awaited SDK call can
resume on a later runtime frame, while callbacks or `OnTick` may have already
changed shared state.

Known pitfalls:

- Checking shared state, awaiting, then reading that same global/shared state can
  crash or apply work to the wrong object. Capture the target object in a local
  variable and use that captured object after awaits.
- End/deactivate paths should usually clear active global state before awaiting
  final cleanup or final update work. Otherwise `OnTick` can continue processing
  an object that is already logically inactive.
- Begin/activate paths should guard against stale async completion. If the
  interaction exits while setup is awaiting, the old begin operation must not
  later assign new active state.
- Use a version/session id or cancellation token for async lifecycle work that
  can be invalidated by later callbacks.
- Runtime object creation inside interaction callbacks can cause visible latency
  because it may require many awaited SDK calls. Prepare reusable entities,
  meshes, or other heavy objects ahead of time when responsiveness matters.

## Performance Notes

- Avoid creating entities, renderables, meshes, or materials inside hot
  interaction paths when possible. Pre-create or pool them.
- Avoid overlapping expensive updates. If an update is already running, queue one
  follow-up refresh instead of starting many concurrent updates.
- Keep generated or accumulated runtime data bounded.
- Filter noisy per-frame input before triggering expensive work.
- Rebuilding full geometry or large buffers every frame can become expensive.
  Prefer batching, throttling, pooling, or incremental update strategies where
  appropriate.

## Development Notes

- Run `npx tsc --noEmit` to type-check.
- Rebuild generated runtime output after changing source files; runtime stack
  traces may refer to built files under `dist/`.
- Keep edits scoped. `.adamas/*` files are generated/project metadata and should
  only be edited when intentionally changing project structure or assets.
