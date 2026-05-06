import * as ImGui from "imgui-adamas";
import {
	AlphaMode,
	Device,
	DevicePath,
	type DeviceSubscription,
	type Entity,
	EntityManager,
	type Material,
	MaterialManager,
	MaterialProperty,
	type Mesh,
	MeshManager,
	RenderableManager,
	ShadowCastingMode,
	type Texture,
	TextureFilterMode,
	TextureFormat,
	TextureManager,
	TextureWrapMode,
	TransformManager,
	User,
} from "@adamasvr/sdk";
import { quat, vec2, vec3, vec4 } from "gl-matrix";

let clipboard_text = "";
let prev_time = 0;

export let gl: null = null;
export let ctx: null = null;

export interface AdamasInitOptions {
	targetEntity: Entity;
	displayWidth?: number;
	displayHeight?: number;
	pixelsPerMeter?: number;
	panelDistance?: number;
	panelOffset?: [number, number, number];
	followHead?: boolean;
	preferredHand?: "left" | "right" | "either";
	leftClickHand?: "left" | "right";
	rightClickHand?: "left" | "right";
	scrollHand?: "left" | "right";
	scrollSpeed?: number;
	scrollDeadzone?: number;
}

interface AdamasTextureId {
	__adamasTexture: Texture;
}

interface InputState {
	leftTrigger: number;
	rightTrigger: number;
	leftPrimaryButton: number;
	rightPrimaryButton: number;
	leftSecondaryButton: number;
	rightSecondaryButton: number;
	leftPrimaryAxis: vec2;
	rightPrimaryAxis: vec2;
}

interface RuntimeState {
	options: Required<AdamasInitOptions>;
	ready: boolean;
	initializing: boolean;
	destroyed: boolean;
	fontTexture: Texture | null;
	rootEntity: Entity | null;
	localUser: User | null;
	headEntity: Entity | null;
	leftHandEntity: Entity | null;
	rightHandEntity: Entity | null;
	subscriptions: DeviceSubscription[];
	input: InputState;
	lastPointerHand: "left" | "right";
	frameEntities: FrameEntity[];
	renderQueue: Promise<void>;
	panelPosition: vec3;
	panelRotation: quat;
	sawGradientColorFallback: boolean;
}

interface FrameEntity {
	entity: Entity;
	mesh: Mesh;
	material: Material;
}

interface SnapshotVertex {
	x: number;
	y: number;
	u: number;
	v: number;
	color: vec4;
}

interface SnapshotBatch {
	textureId: unknown;
	color: vec4;
	vertices: Float32Array;
	uvs: Float32Array;
	normals: Float32Array;
	indices: Uint16Array;
}

interface SnapshotFrame {
	displayWidth: number;
	displayHeight: number;
	batches: SnapshotBatch[];
}

const DEFAULT_OPTIONS: Required<Omit<AdamasInitOptions, "targetEntity">> = {
	displayWidth: 1280,
	displayHeight: 720,
	pixelsPerMeter: 1000,
	panelDistance: 1.25,
	panelOffset: [0, -0.05, 0],
	followHead: false,
	preferredHand: "right",
	leftClickHand: "right",
	rightClickHand: "left",
	scrollHand: "left",
	scrollSpeed: 0.25,
	scrollDeadzone: 0.2,
};

const runtime: RuntimeState = {
	options: {
		...DEFAULT_OPTIONS,
		targetEntity: 0 as Entity,
	},
	ready: false,
	initializing: false,
	destroyed: false,
	fontTexture: null,
	rootEntity: null,
	localUser: null,
	headEntity: null,
	leftHandEntity: null,
	rightHandEntity: null,
	subscriptions: [],
	input: {
		leftTrigger: 0,
		rightTrigger: 0,
		leftPrimaryButton: 0,
		rightPrimaryButton: 0,
		leftSecondaryButton: 0,
		rightSecondaryButton: 0,
		leftPrimaryAxis: vec2.fromValues(0, 0),
		rightPrimaryAxis: vec2.fromValues(0, 0),
	},
	lastPointerHand: "right",
	frameEntities: [],
	renderQueue: Promise.resolve(),
	panelPosition: vec3.create(),
	panelRotation: quat.create(),
	sawGradientColorFallback: false,
};

function isAdamasInitOptions(value: unknown): value is AdamasInitOptions {
	return typeof value === "object" && value !== null;
}

function isAdamasTextureId(value: unknown): value is AdamasTextureId {
	return typeof value === "object" && value !== null && "__adamasTexture" in value;
}

function decodeColorU32(color: number): vec4 {
	return vec4.fromValues(
		((color >> 0) & 0xff) / 255,
		((color >> 8) & 0xff) / 255,
		((color >> 16) & 0xff) / 255,
		((color >> 24) & 0xff) / 255,
	);
}

function cloneVertex(vertex: SnapshotVertex): SnapshotVertex {
	return {
		x: vertex.x,
		y: vertex.y,
		u: vertex.u,
		v: vertex.v,
		color: vec4.clone(vertex.color),
	};
}

function interpolateVertex(a: SnapshotVertex, b: SnapshotVertex, t: number): SnapshotVertex {
	return {
		x: a.x + (b.x - a.x) * t,
		y: a.y + (b.y - a.y) * t,
		u: a.u + (b.u - a.u) * t,
		v: a.v + (b.v - a.v) * t,
		color: vec4.lerp(vec4.create(), a.color, b.color, t),
	};
}

function colorApproxEqual(a: vec4, b: vec4, epsilon = 1 / 255): boolean {
	return (
		Math.abs(a[0] - b[0]) <= epsilon &&
		Math.abs(a[1] - b[1]) <= epsilon &&
		Math.abs(a[2] - b[2]) <= epsilon &&
		Math.abs(a[3] - b[3]) <= epsilon
	);
}

function averageColor(vertices: SnapshotVertex[]): vec4 {
	const color = vec4.create();
	for (const vertex of vertices) {
		color[0] += vertex.color[0];
		color[1] += vertex.color[1];
		color[2] += vertex.color[2];
		color[3] += vertex.color[3];
	}
	const inv = vertices.length > 0 ? 1 / vertices.length : 1;
	color[0] *= inv;
	color[1] *= inv;
	color[2] *= inv;
	color[3] *= inv;
	return color;
}

function clipPolygonAgainstAxis(
	polygon: SnapshotVertex[],
	inside: (v: SnapshotVertex) => boolean,
	intersection: (a: SnapshotVertex, b: SnapshotVertex) => SnapshotVertex,
): SnapshotVertex[] {
	if (polygon.length === 0) {
		return polygon;
	}
	const output: SnapshotVertex[] = [];
	let previous = polygon[polygon.length - 1];
	let previousInside = inside(previous);
	for (const current of polygon) {
		const currentInside = inside(current);
		if (currentInside) {
			if (!previousInside) {
				output.push(intersection(previous, current));
			}
			output.push(current);
		} else if (previousInside) {
			output.push(intersection(previous, current));
		}
		previous = current;
		previousInside = currentInside;
	}
	return output;
}

function clipPolygonToRect(
	polygon: SnapshotVertex[],
	minX: number,
	minY: number,
	maxX: number,
	maxY: number,
): SnapshotVertex[] {
	const clipLeft = (a: SnapshotVertex, b: SnapshotVertex): SnapshotVertex => {
		const t = (minX - a.x) / (b.x - a.x);
		return interpolateVertex(a, b, t);
	};
	const clipRight = (a: SnapshotVertex, b: SnapshotVertex): SnapshotVertex => {
		const t = (maxX - a.x) / (b.x - a.x);
		return interpolateVertex(a, b, t);
	};
	const clipTop = (a: SnapshotVertex, b: SnapshotVertex): SnapshotVertex => {
		const t = (minY - a.y) / (b.y - a.y);
		return interpolateVertex(a, b, t);
	};
	const clipBottom = (a: SnapshotVertex, b: SnapshotVertex): SnapshotVertex => {
		const t = (maxY - a.y) / (b.y - a.y);
		return interpolateVertex(a, b, t);
	};

	let result = polygon.map(cloneVertex);
	result = clipPolygonAgainstAxis(result, (v) => v.x >= minX, clipLeft);
	result = clipPolygonAgainstAxis(result, (v) => v.x <= maxX, clipRight);
	result = clipPolygonAgainstAxis(result, (v) => v.y >= minY, clipTop);
	result = clipPolygonAgainstAxis(result, (v) => v.y <= maxY, clipBottom);
	return result;
}

function tessellatePolygon(polygon: SnapshotVertex[]): SnapshotVertex[][] {
	if (polygon.length < 3) {
		return [];
	}
	const triangles: SnapshotVertex[][] = [];
	for (let i = 1; i < polygon.length - 1; i++) {
		triangles.push([cloneVertex(polygon[0]), cloneVertex(polygon[i]), cloneVertex(polygon[i + 1])]);
	}
	return triangles;
}

function worldFromPixel(
	x: number,
	y: number,
	displayWidth: number,
	displayHeight: number,
	pixelsPerMeter: number,
): vec3 {
	return vec3.fromValues(
		(x - displayWidth * 0.5) / pixelsPerMeter,
		(displayHeight * 0.5 - y) / pixelsPerMeter,
		0,
	);
}

function resolveTextureHandle(textureId: unknown): Texture | null {
	if (typeof textureId === "number") {
		return textureId;
	}
	if (isAdamasTextureId(textureId)) {
		return textureId.__adamasTexture;
	}
	return null;
}

function choosePointerHand(): "left" | "right" {
	if (runtime.options.preferredHand === "either") {
		if (runtime.input.rightTrigger > runtime.input.leftTrigger) {
			runtime.lastPointerHand = "right";
		} else if (runtime.input.leftTrigger > runtime.input.rightTrigger) {
			runtime.lastPointerHand = "left";
		}
		return runtime.lastPointerHand;
	}
	return runtime.options.preferredHand;
}

function currentButtonValue(hand: "left" | "right", kind: "trigger" | "primary" | "secondary"): number {
	if (hand === "left") {
		switch (kind) {
			case "trigger":
				return runtime.input.leftTrigger;
			case "primary":
				return runtime.input.leftPrimaryButton;
			case "secondary":
				return runtime.input.leftSecondaryButton;
		}
	}
	switch (kind) {
		case "trigger":
			return runtime.input.rightTrigger;
		case "primary":
			return runtime.input.rightPrimaryButton;
		case "secondary":
			return runtime.input.rightSecondaryButton;
	}
}

function computeDeltaTime(time: number): number {
	if (prev_time === 0) {
		prev_time = time;
		return 1 / 60;
	}
	if (time >= 0 && time <= 1) {
		return time;
	}
	if (time > prev_time) {
		const delta = (time - prev_time) / 1000;
		prev_time = time;
		return delta > 0 ? delta : 1 / 60;
	}
	prev_time = time;
	return 1 / 60;
}

async function subscribeNumber(devicePath: string, setter: (value: number) => void): Promise<void> {
	const current = await Device.GetValue(devicePath);
	if (typeof current === "number") {
		setter(current);
	}
	const subscription = await Device.SubscribeValueChange(devicePath, (value) => {
		if (typeof value === "number") {
			setter(value);
		}
	});
	runtime.subscriptions.push(subscription);
}

async function subscribeAxis(devicePath: string, setter: (value: vec2) => void): Promise<void> {
	const current = await Device.GetValue(devicePath);
	if (current && typeof current !== "number") {
		setter(vec2.clone(current));
	}
	const subscription = await Device.SubscribeValueChange(devicePath, (value) => {
		if (typeof value !== "number") {
			setter(vec2.clone(value));
		}
	});
	runtime.subscriptions.push(subscription);
}

async function updatePanelPose(): Promise<void> {
	if (!runtime.localUser) {
		return;
	}
	if (runtime.options.followHead && runtime.headEntity !== null) {
		const headPosition = await TransformManager.GetWorldPosition(runtime.headEntity);
		const headRotation = await TransformManager.GetWorldRotation(runtime.headEntity);
		const forward = vec3.transformQuat(vec3.create(), vec3.fromValues(0, 0, -1), headRotation);
		const right = vec3.transformQuat(vec3.create(), vec3.fromValues(1, 0, 0), headRotation);
		const up = vec3.transformQuat(vec3.create(), vec3.fromValues(0, 1, 0), headRotation);
		const offset = runtime.options.panelOffset;
		const worldOffset = vec3.create();
		vec3.scaleAndAdd(worldOffset, worldOffset, right, offset[0]);
		vec3.scaleAndAdd(worldOffset, worldOffset, up, offset[1]);
		vec3.scaleAndAdd(worldOffset, worldOffset, forward, offset[2]);
		vec3.scaleAndAdd(runtime.panelPosition, headPosition, forward, runtime.options.panelDistance);
		vec3.add(runtime.panelPosition, runtime.panelPosition, worldOffset);
		quat.copy(runtime.panelRotation, headRotation);
	} else if (runtime.rootEntity !== null) {
		const rootPosition = await TransformManager.GetWorldPosition(runtime.rootEntity);
		const rootRotation = await TransformManager.GetWorldRotation(runtime.rootEntity);
		vec3.copy(runtime.panelPosition, rootPosition);
		quat.copy(runtime.panelRotation, rootRotation);
	}
	if (runtime.rootEntity !== null) {
		await TransformManager.SetWorldPosition(runtime.rootEntity, runtime.panelPosition);
		await TransformManager.SetWorldRotation(runtime.rootEntity, runtime.panelRotation);
	}
}

async function updateMouseFromHands(): Promise<void> {
	const io = ImGui.GetIO();
	const hand = choosePointerHand();
	const handEntity = hand === "left" ? runtime.leftHandEntity : runtime.rightHandEntity;

	if (handEntity === null) {
		io.MousePos.x = -Number.MAX_VALUE;
		io.MousePos.y = -Number.MAX_VALUE;
		return;
	}

	const origin = await TransformManager.GetWorldPosition(handEntity);
	const rotation = await TransformManager.GetWorldRotation(handEntity);
	const direction = vec3.normalize(
		vec3.create(),
		vec3.transformQuat(vec3.create(), vec3.fromValues(0, 0, -1), rotation),
	);
	//FIXME: todo Adamas SDK does not document controller forward conventions, so this assumes controller rays point along local -Z.
	const planeNormal = vec3.transformQuat(vec3.create(), vec3.fromValues(0, 0, 1), runtime.panelRotation);
	const denominator = vec3.dot(direction, planeNormal);
	if (Math.abs(denominator) < 1e-5) {
		io.MousePos.x = -Number.MAX_VALUE;
		io.MousePos.y = -Number.MAX_VALUE;
		return;
	}

	const originToPlane = vec3.sub(vec3.create(), runtime.panelPosition, origin);
	const distance = vec3.dot(originToPlane, planeNormal) / denominator;
	if (distance <= 0) {
		io.MousePos.x = -Number.MAX_VALUE;
		io.MousePos.y = -Number.MAX_VALUE;
		return;
	}

	const hit = vec3.scaleAndAdd(vec3.create(), origin, direction, distance);
	const panelLocal = vec3.sub(vec3.create(), hit, runtime.panelPosition);
	const inverseRotation = quat.invert(quat.create(), runtime.panelRotation);
	vec3.transformQuat(panelLocal, panelLocal, inverseRotation);

	const x = panelLocal[0] * runtime.options.pixelsPerMeter + runtime.options.displayWidth * 0.5;
	const y = runtime.options.displayHeight * 0.5 - panelLocal[1] * runtime.options.pixelsPerMeter;
	const inside =
		x >= 0 &&
		x <= runtime.options.displayWidth &&
		y >= 0 &&
		y <= runtime.options.displayHeight;
	if (inside) {
		io.MousePos.x = x;
		io.MousePos.y = y;
	} else {
		io.MousePos.x = -Number.MAX_VALUE;
		io.MousePos.y = -Number.MAX_VALUE;
	}
}

async function createFontTextureAsync(): Promise<void> {
	if (runtime.fontTexture !== null) {
		return;
	}
	const io = ImGui.GetIO();
	const { width, height, pixels } = io.Fonts.GetTexDataAsRGBA32();
	const texture = await TextureManager.Create2D(width, height, TextureFormat.RGBA32);
	await TextureManager.LoadRGBAImage(
		texture,
		new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength),
		width,
		height,
	);
	await TextureManager.SetFilterMode(texture, TextureFilterMode.Linear);
	await TextureManager.SetWrapModeU(texture, TextureWrapMode.ClampToEdge);
	await TextureManager.SetWrapModeV(texture, TextureWrapMode.ClampToEdge);
	runtime.fontTexture = texture;
	io.Fonts.TexID = { __adamasTexture: texture } satisfies AdamasTextureId;
}

async function createRootEntityAsync(): Promise<void> {
	if (runtime.rootEntity !== null) {
		return;
	}
	const rootEntity = runtime.options.targetEntity;
	runtime.rootEntity = rootEntity;
	vec3.set(
		runtime.panelPosition,
		runtime.options.panelOffset[0],
		1.4 + runtime.options.panelOffset[1],
		-runtime.options.panelDistance + runtime.options.panelOffset[2],
	);
	quat.identity(runtime.panelRotation);
	await TransformManager.SetWorldPosition(rootEntity, runtime.panelPosition);
	await TransformManager.SetWorldRotation(rootEntity, runtime.panelRotation);
}

async function ensureInitializedAsync(): Promise<void> {
	if (runtime.ready || runtime.initializing || runtime.destroyed) {
		return;
	}
	runtime.initializing = true;
	try {
		runtime.localUser = await User.GetLocalUser();
		runtime.headEntity = await runtime.localUser.GetHeadEntity();
		runtime.leftHandEntity = await runtime.localUser.GetLeftHandEntity();
		runtime.rightHandEntity = await runtime.localUser.GetRightHandEntity();
		await subscribeNumber(DevicePath.LEFT_TRIGGER, (value) => {
			runtime.input.leftTrigger = value;
		});
		await subscribeNumber(DevicePath.RIGHT_TRIGGER, (value) => {
			runtime.input.rightTrigger = value;
		});
		await subscribeNumber(DevicePath.LEFT_PRIMARY_BUTTON, (value) => {
			runtime.input.leftPrimaryButton = value;
		});
		await subscribeNumber(DevicePath.RIGHT_PRIMARY_BUTTON, (value) => {
			runtime.input.rightPrimaryButton = value;
		});
		await subscribeNumber(DevicePath.LEFT_SECONDARY_BUTTON, (value) => {
			runtime.input.leftSecondaryButton = value;
		});
		await subscribeNumber(DevicePath.RIGHT_SECONDARY_BUTTON, (value) => {
			runtime.input.rightSecondaryButton = value;
		});
		await subscribeAxis(DevicePath.LEFT_PRIMARY_2D_AXIS, (value) => {
			vec2.copy(runtime.input.leftPrimaryAxis, value);
		});
		await subscribeAxis(DevicePath.RIGHT_PRIMARY_2D_AXIS, (value) => {
			vec2.copy(runtime.input.rightPrimaryAxis, value);
		});
		await createRootEntityAsync();
		await createFontTextureAsync();
		await updatePanelPose();
		runtime.ready = true;
	} finally {
		runtime.initializing = false;
	}
}

async function destroyFrameEntitiesAsync(startIndex = 0): Promise<void> {
	for (const frameEntity of runtime.frameEntities.splice(startIndex)) {
		try {
			await RenderableManager.Destroy(frameEntity.entity);
		} catch {}
		try {
			await MeshManager.Destroy(frameEntity.mesh);
		} catch {}
		try {
			await MaterialManager.Destroy(frameEntity.material);
		} catch {}
		try {
			await EntityManager.Destroy(frameEntity.entity);
		} catch {}
	}
}

async function ensureFrameEntityAsync(index: number): Promise<FrameEntity | null> {
	if (runtime.rootEntity === null) {
		return null;
	}
	const existing = runtime.frameEntities[index];
	if (existing) {
		return existing;
	}
	const entity = await EntityManager.Create(`ImGui Batch ${index}`);
	const mesh = await MeshManager.Create();
	const material = await MaterialManager.Create();
	const frameEntity = { entity, mesh, material };
	runtime.frameEntities.push(frameEntity);

	await TransformManager.SetParent(entity, runtime.rootEntity);
	await TransformManager.SetLocalPosition(entity, vec3.create());
	await TransformManager.SetLocalRotation(entity, quat.create());
	await TransformManager.SetLocalScale(entity, vec3.fromValues(1, 1, 1));

	await RenderableManager.Create(entity);
	await RenderableManager.SetMesh(entity, mesh);
	await RenderableManager.SetMaterial(entity, material, 0);
	await RenderableManager.SetReceiveShadows(entity, false);
	await RenderableManager.SetShadowMode(entity, ShadowCastingMode.Off);
	return frameEntity;
}

async function updateRenderableBatchAsync(batch: SnapshotBatch, index: number): Promise<void> {
	const texture = resolveTextureHandle(batch.textureId);
	if (texture === null) {
		//FIXME: todo current Adamas backend only knows how to consume `Texture` handles or the font atlas texture created by this file.
		return;
	}
	const frameEntity = await ensureFrameEntityAsync(index);
	if (frameEntity === null) {
		return;
	}
	const { entity, mesh, material } = frameEntity;
	await RenderableManager.SetEnabled(entity, true);

	await MeshManager.SetVertices(mesh, batch.vertices);
	await MeshManager.SetUVs(mesh, batch.uvs);
	await MeshManager.SetNormals(mesh, batch.normals);
	await MeshManager.SetTriangles(mesh, batch.indices);
	await MeshManager.RecalcBounds(mesh);

	await MaterialManager.SetAlphaMode(material, AlphaMode.Blend);
	await MaterialManager.SetTexture(material, MaterialProperty.BaseColorMap, texture);
	await MaterialManager.SetTexture(material, MaterialProperty.EmissionMap, texture);
	await MaterialManager.SetColor(material, MaterialProperty.BaseColor, batch.color);
	await MaterialManager.SetVector(
		material,
		MaterialProperty.Emission,
		vec4.fromValues(batch.color[0], batch.color[1], batch.color[2], 1),
	);
	await MaterialManager.SetFloat(material, MaterialProperty.Culling, 0);
	//FIXME: todo the public Adamas SDK does not currently expose a dedicated unlit UI material, so this backend approximates UI shading with emission + alpha blending.
}

function buildSnapshot(draw_data: ImGui.DrawData): SnapshotFrame {
	const displayWidth = runtime.options.displayWidth;
	const displayHeight = runtime.options.displayHeight;
	const buckets = new Map<
		string,
		{
			textureId: unknown;
			color: vec4;
			vertices: number[];
			uvs: number[];
			normals: number[];
			indices: number[];
		}
	>();

	const pushTriangle = (textureId: unknown, color: vec4, triangle: SnapshotVertex[]): void => {
		const key =
			(typeof textureId === "number" ? `t${textureId}` : textureId === null ? "tnull" : "tobj") +
			`|c${[color[0], color[1], color[2], color[3]].map((v) => Math.round(v * 255)).join(",")}`;
		let bucket = buckets.get(key);
		if (!bucket) {
			bucket = {
				textureId,
				color: vec4.clone(color),
				vertices: [],
				uvs: [],
				normals: [],
				indices: [],
			};
			buckets.set(key, bucket);
		}
		const baseIndex = bucket.vertices.length / 3;
		if (baseIndex + triangle.length > 65535) {
			//FIXME: todo split oversized ImGui batches across multiple Adamas meshes when a single bucket exceeds Uint16 index limits.
			return;
		}
		for (const vertex of triangle) {
			const world = worldFromPixel(
				vertex.x,
				vertex.y,
				displayWidth,
				displayHeight,
				runtime.options.pixelsPerMeter,
			);
			bucket.vertices.push(world[0], world[1], world[2]);
			bucket.uvs.push(vertex.u, vertex.v);
			bucket.normals.push(0, 0, 1);
		}
		bucket.indices.push(baseIndex, baseIndex + 1, baseIndex + 2);
	};

	draw_data.IterateDrawLists((draw_list: ImGui.DrawList): void => {
		draw_list.IterateDrawCmds((draw_cmd: ImGui.DrawCmd): void => {
			if (draw_cmd.UserCallback !== null) {
				//FIXME: todo Adamas backend does not yet forward ImDrawCmd user callbacks to a platform-specific render hook.
				return;
			}

			const clipMinX = draw_cmd.ClipRect.x - draw_data.DisplayPos.x;
			const clipMinY = draw_cmd.ClipRect.y - draw_data.DisplayPos.y;
			const clipMaxX = draw_cmd.ClipRect.z - draw_data.DisplayPos.x;
			const clipMaxY = draw_cmd.ClipRect.w - draw_data.DisplayPos.y;
			if (clipMinX >= clipMaxX || clipMinY >= clipMaxY) {
				return;
			}

			const indexBuffer =
				ImGui.DrawIdxSize === 4
					? new Uint32Array(
							draw_list.IdxBuffer.buffer,
							draw_list.IdxBuffer.byteOffset + draw_cmd.IdxOffset * ImGui.DrawIdxSize,
							draw_cmd.ElemCount,
					  )
					: new Uint16Array(
							draw_list.IdxBuffer.buffer,
							draw_list.IdxBuffer.byteOffset + draw_cmd.IdxOffset * ImGui.DrawIdxSize,
							draw_cmd.ElemCount,
					  );

			for (let i = 0; i + 2 < draw_cmd.ElemCount; i += 3) {
				const vertices: SnapshotVertex[] = [];
				for (let corner = 0; corner < 3; corner++) {
					const index = indexBuffer[i + corner];
					const drawVert = new ImGui.DrawVert(
						draw_list.VtxBuffer.buffer as ArrayBuffer,
						draw_list.VtxBuffer.byteOffset + index * ImGui.DrawVertSize,
					);
					vertices.push({
						x: drawVert.pos[0] - draw_data.DisplayPos.x,
						y: drawVert.pos[1] - draw_data.DisplayPos.y,
						u: drawVert.uv[0],
						v: drawVert.uv[1],
						color: decodeColorU32(drawVert.col[0]),
					});
				}

				const clipped = clipPolygonToRect(vertices, clipMinX, clipMinY, clipMaxX, clipMaxY);
				if (clipped.length < 3) {
					continue;
				}

				for (const triangle of tessellatePolygon(clipped)) {
					const triangleColor =
						colorApproxEqual(triangle[0].color, triangle[1].color) &&
						colorApproxEqual(triangle[1].color, triangle[2].color)
							? vec4.clone(triangle[0].color)
							: averageColor(triangle);
					if (
						!colorApproxEqual(triangle[0].color, triangle[1].color) ||
						!colorApproxEqual(triangle[1].color, triangle[2].color)
					) {
						runtime.sawGradientColorFallback = true;
					}
					pushTriangle(draw_cmd.TextureId, triangleColor, triangle);
				}
			}
		});
	});

	const batches: SnapshotBatch[] = [];
	for (const bucket of buckets.values()) {
		if (bucket.indices.length === 0) {
			continue;
		}
		batches.push({
			textureId: bucket.textureId,
			color: bucket.color,
			vertices: new Float32Array(bucket.vertices),
			uvs: new Float32Array(bucket.uvs),
			normals: new Float32Array(bucket.normals),
			indices: new Uint16Array(bucket.indices),
		});
	}
	return { displayWidth, displayHeight, batches };
}

async function renderSnapshotAsync(snapshot: SnapshotFrame): Promise<void> {
	await ensureInitializedAsync();
	if (!runtime.ready || runtime.destroyed) {
		return;
	}
	await updatePanelPose();
	for (let i = 0; i < snapshot.batches.length; i++) {
		await updateRenderableBatchAsync(snapshot.batches[i], i);
	}
	for (let i = snapshot.batches.length; i < runtime.frameEntities.length; i++) {
		try {
			await RenderableManager.SetEnabled(runtime.frameEntities[i].entity, false);
		} catch {}
	}
}

export function Init(value: AdamasInitOptions | null): void {
	if (!isAdamasInitOptions(value) || value.targetEntity === undefined) {
		throw new Error("imgui_impl_adamas.Init requires a targetEntity");
	}
	const io = ImGui.GetIO();
	runtime.destroyed = false;
	runtime.options = {
		...DEFAULT_OPTIONS,
		...value,
	};
	runtime.lastPointerHand = runtime.options.preferredHand === "left" ? "left" : "right";
	io.BackendPlatformName = "imgui_impl_adamas";
	io.DisplaySize.x = runtime.options.displayWidth;
	io.DisplaySize.y = runtime.options.displayHeight;
	io.DisplayFramebufferScale.x = 1;
	io.DisplayFramebufferScale.y = 1;
	//FIXME: todo there is no Adamas SDK persistence API in the current public typings for automatically loading/saving imgui.ini state.

	io.SetClipboardTextFn = (_user_data: unknown, text: string): void => {
		clipboard_text = text;
		//FIXME: todo current Adamas SDK typings do not expose platform clipboard APIs, so clipboard support is in-memory only.
	};
	io.GetClipboardTextFn = (): string => clipboard_text;
	io.ClipboardUserData = null;

	io.KeyMap[ImGui.Key.Tab] = 9;
	io.KeyMap[ImGui.Key.LeftArrow] = 37;
	io.KeyMap[ImGui.Key.RightArrow] = 39;
	io.KeyMap[ImGui.Key.UpArrow] = 38;
	io.KeyMap[ImGui.Key.DownArrow] = 40;
	io.KeyMap[ImGui.Key.PageUp] = 33;
	io.KeyMap[ImGui.Key.PageDown] = 34;
	io.KeyMap[ImGui.Key.Home] = 36;
	io.KeyMap[ImGui.Key.End] = 35;
	io.KeyMap[ImGui.Key.Insert] = 45;
	io.KeyMap[ImGui.Key.Delete] = 46;
	io.KeyMap[ImGui.Key.Backspace] = 8;
	io.KeyMap[ImGui.Key.Space] = 32;
	io.KeyMap[ImGui.Key.Enter] = 13;
	io.KeyMap[ImGui.Key.Escape] = 27;
	io.KeyMap[ImGui.Key.A] = 65;
	io.KeyMap[ImGui.Key.C] = 67;
	io.KeyMap[ImGui.Key.V] = 86;
	io.KeyMap[ImGui.Key.X] = 88;
	io.KeyMap[ImGui.Key.Y] = 89;
	io.KeyMap[ImGui.Key.Z] = 90;
	//FIXME: todo keyboard text input and physical key state are not wired because the current public Adamas SDK typings only expose controller-style device inputs.

	CreateDeviceObjects();
}

export function Shutdown(): void {
	runtime.destroyed = true;
	DestroyDeviceObjects();
}

export function NewFrame(time: number): void {
	const io = ImGui.GetIO();
	io.DisplaySize.x = runtime.options.displayWidth;
	io.DisplaySize.y = runtime.options.displayHeight;
	io.DisplayFramebufferScale.x = 1;
	io.DisplayFramebufferScale.y = 1;
	io.DeltaTime = computeDeltaTime(time);

	const leftClick = currentButtonValue(runtime.options.leftClickHand, "trigger");
	const rightClick = currentButtonValue(runtime.options.rightClickHand, "trigger");
	io.MouseDown[0] = leftClick > 0.5;
	io.MouseDown[1] = rightClick > 0.5;
	io.MouseDown[2] = false;

	const scrollAxis =
		runtime.options.scrollHand === "left"
			? runtime.input.leftPrimaryAxis
			: runtime.input.rightPrimaryAxis;
	io.MouseWheel =
		Math.abs(scrollAxis[1]) > runtime.options.scrollDeadzone
			? scrollAxis[1] * runtime.options.scrollSpeed
			: 0;
	io.MouseWheelH =
		Math.abs(scrollAxis[0]) > runtime.options.scrollDeadzone
			? scrollAxis[0] * runtime.options.scrollSpeed
			: 0;

	if (!runtime.ready) {
		io.MousePos.x = -Number.MAX_VALUE;
		io.MousePos.y = -Number.MAX_VALUE;
		return;
	}

	void runtime.renderQueue.then(async () => {
		if (!runtime.destroyed) {
			await updatePanelPose();
			await updateMouseFromHands();
		}
	});

	//FIXME: todo Adamas SDK does not currently expose OS cursor APIs, so MouseDrawCursor/GetMouseCursor are ignored.
}

export function RenderDrawData(
	draw_data: ImGui.DrawData | null = ImGui.GetDrawData(),
): void {
	if (draw_data === null || runtime.destroyed) {
		return;
	}
	const snapshot = buildSnapshot(draw_data);
	runtime.renderQueue = runtime.renderQueue
		.then(async () => {
			await renderSnapshotAsync(snapshot);
		})
		.catch((error) => {
			console.error("imgui_impl_adamas RenderDrawData failed", error);
		});
}

export function CreateFontsTexture(): void {
	void ensureInitializedAsync().catch((error) => {
		console.error("imgui_impl_adamas CreateFontsTexture failed", error);
	});
}

export function DestroyFontsTexture(): void {
	const texture = runtime.fontTexture;
	runtime.fontTexture = null;
	ImGui.GetIO().Fonts.TexID = null;
	if (texture !== null) {
		void TextureManager.Destroy(texture).catch((error) => {
			console.error("imgui_impl_adamas DestroyFontsTexture failed", error);
		});
	}
}

export function CreateDeviceObjects(): void {
	void ensureInitializedAsync().catch((error) => {
		console.error("imgui_impl_adamas CreateDeviceObjects failed", error);
	});
}

export function DestroyDeviceObjects(): void {
	const pendingSubscriptions = [...runtime.subscriptions];
	runtime.subscriptions = [];
	void Promise.all(
		pendingSubscriptions.map((subscription) =>
			Device.UnsubscribeValueChange(subscription).catch(() => false),
		),
	)
		.then(async () => {
			await destroyFrameEntitiesAsync();
			runtime.rootEntity = null;
			if (runtime.fontTexture !== null) {
				await TextureManager.Destroy(runtime.fontTexture).catch(() => false);
				runtime.fontTexture = null;
			}
			runtime.ready = false;
			runtime.localUser = null;
			runtime.headEntity = null;
			runtime.leftHandEntity = null;
			runtime.rightHandEntity = null;
		})
		.catch((error) => {
			console.error("imgui_impl_adamas DestroyDeviceObjects failed", error);
		});
}
