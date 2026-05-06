import * as ImGui from "imgui-adamas";
import {
	AlphaMode,
	Device,
	DevicePath,
	type DeviceSubscription,
	type Entity,
	type Material,
	MaterialManager,
	MaterialProperty,
	NewQuadMesh,
	type Texture,
	TextureFilterMode,
	TextureFormat,
	TextureManager,
	TextureWrapMode,
	TransformManager,
	User,
	RenderableManager,
	ShadowCastingMode,
} from "@adamasvr/sdk";
import { quat, vec2, vec3 } from "gl-matrix";

type TextureId = number;

interface CpuTexture {
	width: number;
	height: number;
	rgba: Uint8Array;
}

export interface AdamasInitOptions {
	targetEntity: Entity;
	displayWidth?: number;
	displayHeight?: number;
	followHead?: boolean;
	panelDistance?: number;
	panelOffset?: [number, number, number];
	panelSizeMeters?: [number, number];
	preferredHand?: "left" | "right" | "either";
	leftClickHand?: "left" | "right";
	rightClickHand?: "left" | "right";
	scrollHand?: "left" | "right";
	scrollSpeed?: number;
	scrollDeadzone?: number;
	clearColor?: [number, number, number, number];
}

const DEFAULT_OPTIONS: Required<Omit<AdamasInitOptions, "targetEntity">> = {
	displayWidth: 1280,
	displayHeight: 720,
	followHead: false,
	panelDistance: 0.25,
	panelOffset: [0, -0.05, 0],
	panelSizeMeters: [1.28, 0.72],
	preferredHand: "right",
	leftClickHand: "right",
	rightClickHand: "left",
	scrollHand: "left",
	scrollSpeed: 0.25,
	scrollDeadzone: 0.2,
	clearColor: [0, 0, 0, 1],
};

function createRuntime(options: AdamasInitOptions) {
	const runtimeOptions = {
		...DEFAULT_OPTIONS,
		...options,
	};
	const framebufferSize =
		runtimeOptions.displayWidth * runtimeOptions.displayHeight * 4;
	return {
		options: runtimeOptions,
		initialized: false,
		initializing: false,
		shutdown: false,
		prevTime: 0,
		framebuffer: new Uint8Array(framebufferSize),
		uploadBuffer: new Uint8Array(framebufferSize),
		outputTexture: null as Texture | null,
		fontTextureId: null as TextureId | null,
		textureRegistry: new Map<TextureId, CpuTexture>(),
		nextTextureId: 1,
		headEntity: null as Entity | null,
		leftHandEntity: null as Entity | null,
		rightHandEntity: null as Entity | null,
		targetEntity: null as Entity | null,
		targetMaterial: null as Material | null,
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
		lastPointerHand: (runtimeOptions.preferredHand === "left"
			? "left"
			: "right") as "left" | "right",
		subscriptions: [] as DeviceSubscription[],
		renderQueue: Promise.resolve(),
		panelPosition: vec3.create(),
		panelRotation: quat.create(),
	};
}

let runtime = createRuntime({ targetEntity: 0 as Entity });

export let gl: null = null;
export let ctx: null = null;

let clipboardText = "";

function nextTextureId(): TextureId {
	const id = runtime.nextTextureId++;
	return id;
}

function clearFramebuffer(): void {
	const [r, g, b, a] = runtime.options.clearColor;
	const rr = Math.round(Math.max(0, Math.min(1, r)) * 255);
	const gg = Math.round(Math.max(0, Math.min(1, g)) * 255);
	const bb = Math.round(Math.max(0, Math.min(1, b)) * 255);
	const aa = Math.round(Math.max(0, Math.min(1, a)) * 255);
	for (let i = 0; i < runtime.framebuffer.length; i += 4) {
		runtime.framebuffer[i + 0] = rr;
		runtime.framebuffer[i + 1] = gg;
		runtime.framebuffer[i + 2] = bb;
		runtime.framebuffer[i + 3] = aa;
	}
}

function framebufferIndex(x: number, y: number): number {
	return (y * runtime.options.displayWidth + x) * 4;
}

function alphaBlendPixel(
	index: number,
	srcR: number,
	srcG: number,
	srcB: number,
	srcA: number,
): void {
	const dstR = runtime.framebuffer[index + 0] / 255;
	const dstG = runtime.framebuffer[index + 1] / 255;
	const dstB = runtime.framebuffer[index + 2] / 255;
	const dstA = runtime.framebuffer[index + 3] / 255;

	const outA = srcA + dstA * (1 - srcA);
	if (outA <= 0) {
		runtime.framebuffer[index + 0] = 0;
		runtime.framebuffer[index + 1] = 0;
		runtime.framebuffer[index + 2] = 0;
		runtime.framebuffer[index + 3] = 0;
		return;
	}

	const outR = (srcR * srcA + dstR * dstA * (1 - srcA)) / outA;
	const outG = (srcG * srcA + dstG * dstA * (1 - srcA)) / outA;
	const outB = (srcB * srcA + dstB * dstA * (1 - srcA)) / outA;

	runtime.framebuffer[index + 0] = Math.round(
		Math.max(0, Math.min(1, outR)) * 255,
	);
	runtime.framebuffer[index + 1] = Math.round(
		Math.max(0, Math.min(1, outG)) * 255,
	);
	runtime.framebuffer[index + 2] = Math.round(
		Math.max(0, Math.min(1, outB)) * 255,
	);
	runtime.framebuffer[index + 3] = Math.round(
		Math.max(0, Math.min(1, outA)) * 255,
	);
}

function sampleTexture(
	texture: CpuTexture,
	u: number,
	v: number,
): [number, number, number, number] {
	const uu = Math.max(0, Math.min(1, u));
	const vv = Math.max(0, Math.min(1, v));
	const x = Math.max(
		0,
		Math.min(texture.width - 1, Math.floor(uu * (texture.width - 1) + 0.5)),
	);
	const y = Math.max(
		0,
		Math.min(texture.height - 1, Math.floor(vv * (texture.height - 1) + 0.5)),
	);
	const idx = (y * texture.width + x) * 4;
	return [
		texture.rgba[idx + 0] / 255,
		texture.rgba[idx + 1] / 255,
		texture.rgba[idx + 2] / 255,
		texture.rgba[idx + 3] / 255,
	];
}

function edge(
	ax: number,
	ay: number,
	bx: number,
	by: number,
	px: number,
	py: number,
): number {
	return (px - ax) * (by - ay) - (py - ay) * (bx - ax);
}

function rasterizeTriangle(
	v0: ImGui.DrawVert,
	v1: ImGui.DrawVert,
	v2: ImGui.DrawVert,
	texture: CpuTexture | null,
	clipMinX: number,
	clipMinY: number,
	clipMaxX: number,
	clipMaxY: number,
	displayPosX: number,
	displayPosY: number,
): void {
	const x0 = v0.pos[0] - displayPosX;
	const y0 = v0.pos[1] - displayPosY;
	const x1 = v1.pos[0] - displayPosX;
	const y1 = v1.pos[1] - displayPosY;
	const x2 = v2.pos[0] - displayPosX;
	const y2 = v2.pos[1] - displayPosY;

	const area = edge(x0, y0, x1, y1, x2, y2);
	if (area === 0) {
		return;
	}

	const minX = Math.max(
		0,
		Math.floor(Math.min(x0, x1, x2)),
		Math.floor(clipMinX),
	);
	const minY = Math.max(
		0,
		Math.floor(Math.min(y0, y1, y2)),
		Math.floor(clipMinY),
	);
	const maxX = Math.min(
		runtime.options.displayWidth - 1,
		Math.ceil(Math.max(x0, x1, x2)),
		Math.ceil(clipMaxX) - 1,
	);
	const maxY = Math.min(
		runtime.options.displayHeight - 1,
		Math.ceil(Math.max(y0, y1, y2)),
		Math.ceil(clipMaxY) - 1,
	);

	if (minX > maxX || minY > maxY) {
		return;
	}

	for (let py = minY; py <= maxY; py++) {
		for (let px = minX; px <= maxX; px++) {
			const sampleX = px + 0.5;
			const sampleY = py + 0.5;
			const w0 = edge(x1, y1, x2, y2, sampleX, sampleY);
			const w1 = edge(x2, y2, x0, y0, sampleX, sampleY);
			const w2 = edge(x0, y0, x1, y1, sampleX, sampleY);

			const inside =
				(area > 0 && w0 >= 0 && w1 >= 0 && w2 >= 0) ||
				(area < 0 && w0 <= 0 && w1 <= 0 && w2 <= 0);
			if (!inside) {
				continue;
			}

			const invArea = 1 / area;
			const a0 = w0 * invArea;
			const a1 = w1 * invArea;
			const a2 = w2 * invArea;

			const uvx = v0.uv[0] * a0 + v1.uv[0] * a1 + v2.uv[0] * a2;
			const uvy = v0.uv[1] * a0 + v1.uv[1] * a1 + v2.uv[1] * a2;

			const c0 = v0.col[0];
			const c1 = v1.col[0];
			const c2 = v2.col[0];
			const vr =
				(((c0 >> 0) & 0xff) * a0 +
					((c1 >> 0) & 0xff) * a1 +
					((c2 >> 0) & 0xff) * a2) /
				255;
			const vg =
				(((c0 >> 8) & 0xff) * a0 +
					((c1 >> 8) & 0xff) * a1 +
					((c2 >> 8) & 0xff) * a2) /
				255;
			const vb =
				(((c0 >> 16) & 0xff) * a0 +
					((c1 >> 16) & 0xff) * a1 +
					((c2 >> 16) & 0xff) * a2) /
				255;
			const va =
				(((c0 >> 24) & 0xff) * a0 +
					((c1 >> 24) & 0xff) * a1 +
					((c2 >> 24) & 0xff) * a2) /
				255;

			let tr = 1;
			let tg = 1;
			let tb = 1;
			let ta = 1;
			if (texture !== null) {
				[tr, tg, tb, ta] = sampleTexture(texture, uvx, uvy);
			}

			const outR = vr * tr;
			const outG = vg * tg;
			const outB = vb * tb;
			const outA = va * ta;

			alphaBlendPixel(framebufferIndex(px, py), outR, outG, outB, outA);
		}
	}
}

function getTexture(textureId: TextureId): CpuTexture | null {
	return runtime.textureRegistry.get(textureId) ?? null;
}

function computeDeltaTime(time: number): number {
	if (runtime.prevTime === 0) {
		runtime.prevTime = time;
		return 1 / 60;
	}
	if (time >= 0 && time <= 1) {
		return time;
	}
	if (time > runtime.prevTime) {
		const delta = (time - runtime.prevTime) / 1000;
		runtime.prevTime = time;
		return delta > 0 ? delta : 1 / 60;
	}
	runtime.prevTime = time;
	return 1 / 60;
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

function currentButtonValue(
	hand: "left" | "right",
	kind: "trigger" | "primary" | "secondary",
): number {
	if (hand === "left") {
		if (kind === "trigger") return runtime.input.leftTrigger;
		if (kind === "primary") return runtime.input.leftPrimaryButton;
		return runtime.input.leftSecondaryButton;
	}
	if (kind === "trigger") return runtime.input.rightTrigger;
	if (kind === "primary") return runtime.input.rightPrimaryButton;
	return runtime.input.rightSecondaryButton;
}

async function subscribeDeviceValue<T>(
	devicePath: string,
	guard: (value: unknown) => value is T,
	setter: (value: T) => void,
): Promise<void> {
	const current = await Device.GetValue(devicePath);
	if (guard(current)) {
		setter(current);
	}
	const subscription = await Device.SubscribeValueChange(
		devicePath,
		(value) => {
			if (guard(value)) {
				setter(value);
			}
		},
	);
	runtime.subscriptions.push(subscription);
}

function isNumber(value: unknown): value is number {
	return typeof value === "number";
}

function isVec2(value: unknown): value is vec2 {
	return Array.isArray(value) || ArrayBuffer.isView(value);
}

async function ensurePanelEntity(): Promise<void> {
	if (runtime.targetEntity !== null) {
		return;
	}

	runtime.targetEntity = runtime.options.targetEntity;

	if (!(await RenderableManager.HasComponent(runtime.targetEntity))) {
		await RenderableManager.Create(runtime.targetEntity);
	}

	await RenderableManager.SetMesh(runtime.targetEntity, await NewQuadMesh());
	await RenderableManager.SetReceiveShadows(runtime.targetEntity, false);
	await RenderableManager.SetShadowMode(
		runtime.targetEntity,
		ShadowCastingMode.Off,
	);

	runtime.targetMaterial = await MaterialManager.Create();
	await RenderableManager.SetMaterial(
		runtime.targetEntity,
		runtime.targetMaterial,
	);
	await MaterialManager.SetAlphaMode(runtime.targetMaterial, AlphaMode.Opaque);
	await MaterialManager.SetFloat(
		runtime.targetMaterial,
		MaterialProperty.Culling,
		0,
	);

	const [widthMeters, heightMeters] = runtime.options.panelSizeMeters;
	await TransformManager.SetLocalScale(
		runtime.targetEntity,
		vec3.fromValues(widthMeters, heightMeters, 1),
	);
	vec3.set(
		runtime.panelPosition,
		runtime.options.panelOffset[0],
		1.4 + runtime.options.panelOffset[1],
		-runtime.options.panelDistance + runtime.options.panelOffset[2],
	);
	quat.identity(runtime.panelRotation);
	await TransformManager.SetWorldPosition(
		runtime.targetEntity,
		runtime.panelPosition,
	);
	await TransformManager.SetWorldRotation(
		runtime.targetEntity,
		runtime.panelRotation,
	);
}

async function ensureOutputTexture(): Promise<void> {
	if (runtime.outputTexture !== null) {
		return;
	}
	runtime.outputTexture = await TextureManager.Create2D(
		runtime.options.displayWidth,
		runtime.options.displayHeight,
		TextureFormat.RGBA32,
		true,
	);
	await TextureManager.SetFilterMode(
		runtime.outputTexture,
		TextureFilterMode.Linear,
	);
	await TextureManager.SetWrapModeU(
		runtime.outputTexture,
		TextureWrapMode.ClampToEdge,
	);
	await TextureManager.SetWrapModeV(
		runtime.outputTexture,
		TextureWrapMode.ClampToEdge,
	);
	if (runtime.targetMaterial !== null) {
		await MaterialManager.SetTexture(
			runtime.targetMaterial,
			MaterialProperty.BaseColorMap,
			runtime.outputTexture,
		);
		await MaterialManager.SetTexture(
			runtime.targetMaterial,
			MaterialProperty.EmissionMap,
			runtime.outputTexture,
		);
	}
}

async function ensureFontTexture(): Promise<void> {
	if (runtime.fontTextureId !== null) {
		return;
	}
	const { width, height, pixels } = ImGui.GetIO().Fonts.GetTexDataAsRGBA32();
	const id = nextTextureId();
	const rgba = new Uint8Array(
		pixels.buffer,
		pixels.byteOffset,
		pixels.byteLength,
	);
	const cpuTexture: CpuTexture = {
		width,
		height,
		rgba: new Uint8Array(rgba),
	};
	runtime.fontTextureId = id;
	runtime.textureRegistry.set(id, cpuTexture);
	ImGui.GetIO().Fonts.TexID = id;
}

async function updatePanelPose(): Promise<void> {
	if (runtime.targetEntity === null) {
		return;
	}
	if (runtime.options.followHead && runtime.headEntity !== null) {
		const headPosition = await TransformManager.GetWorldPosition(
			runtime.headEntity,
		);
		const headRotation = await TransformManager.GetWorldRotation(
			runtime.headEntity,
		);
		const forward = vec3.transformQuat(
			vec3.create(),
			vec3.fromValues(0, 0, -1),
			headRotation,
		);
		const right = vec3.transformQuat(
			vec3.create(),
			vec3.fromValues(1, 0, 0),
			headRotation,
		);
		const up = vec3.transformQuat(
			vec3.create(),
			vec3.fromValues(0, 1, 0),
			headRotation,
		);
		const offset = runtime.options.panelOffset;
		const worldOffset = vec3.create();
		vec3.scaleAndAdd(worldOffset, worldOffset, right, offset[0]);
		vec3.scaleAndAdd(worldOffset, worldOffset, up, offset[1]);
		vec3.scaleAndAdd(worldOffset, worldOffset, forward, offset[2]);
		vec3.scaleAndAdd(
			runtime.panelPosition,
			headPosition,
			forward,
			runtime.options.panelDistance,
		);
		vec3.add(runtime.panelPosition, runtime.panelPosition, worldOffset);
		quat.copy(runtime.panelRotation, headRotation);
		await TransformManager.SetWorldPosition(
			runtime.targetEntity,
			runtime.panelPosition,
		);
		await TransformManager.SetWorldRotation(
			runtime.targetEntity,
			runtime.panelRotation,
		);
	}
}

async function updateMouseFromHands(): Promise<void> {
	const io = ImGui.GetIO();
	const hand = choosePointerHand();
	const handEntity =
		hand === "left" ? runtime.leftHandEntity : runtime.rightHandEntity;

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
	//FIXME: todo controller ray direction is assumed to be local -Z because the SDK typings do not document a canonical pointer pose axis.
	const planeNormal = vec3.transformQuat(
		vec3.create(),
		vec3.fromValues(0, 0, 1),
		runtime.panelRotation,
	);
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

	const [panelWidthMeters, panelHeightMeters] = runtime.options.panelSizeMeters;
	const x =
		(panelLocal[0] / panelWidthMeters + 0.5) * runtime.options.displayWidth;
	const y =
		(0.5 - panelLocal[1] / panelHeightMeters) * runtime.options.displayHeight;
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

async function ensureInitialized(): Promise<void> {
	if (runtime.initialized || runtime.initializing || runtime.shutdown) {
		return;
	}
	runtime.initializing = true;
	try {
		const localUser = await User.GetLocalUser();
		runtime.headEntity = await localUser.GetHeadEntity();
		runtime.leftHandEntity = await localUser.GetLeftHandEntity();
		runtime.rightHandEntity = await localUser.GetRightHandEntity();

		await subscribeDeviceValue(
			DevicePath.LEFT_TRIGGER,
			isNumber,
			(value) => (runtime.input.leftTrigger = value),
		);
		await subscribeDeviceValue(
			DevicePath.RIGHT_TRIGGER,
			isNumber,
			(value) => (runtime.input.rightTrigger = value),
		);
		await subscribeDeviceValue(
			DevicePath.LEFT_PRIMARY_BUTTON,
			isNumber,
			(value) => (runtime.input.leftPrimaryButton = value),
		);
		await subscribeDeviceValue(
			DevicePath.RIGHT_PRIMARY_BUTTON,
			isNumber,
			(value) => (runtime.input.rightPrimaryButton = value),
		);
		await subscribeDeviceValue(
			DevicePath.LEFT_SECONDARY_BUTTON,
			isNumber,
			(value) => (runtime.input.leftSecondaryButton = value),
		);
		await subscribeDeviceValue(
			DevicePath.RIGHT_SECONDARY_BUTTON,
			isNumber,
			(value) => (runtime.input.rightSecondaryButton = value),
		);
		await subscribeDeviceValue(
			DevicePath.LEFT_PRIMARY_2D_AXIS,
			isVec2,
			(value) => vec2.copy(runtime.input.leftPrimaryAxis, value),
		);
		await subscribeDeviceValue(
			DevicePath.RIGHT_PRIMARY_2D_AXIS,
			isVec2,
			(value) => vec2.copy(runtime.input.rightPrimaryAxis, value),
		);

		await ensurePanelEntity();
		await ensureOutputTexture();
		await ensureFontTexture();
		await updatePanelPose();
		runtime.initialized = true;
	} finally {
		runtime.initializing = false;
	}
}

function renderCpu(drawData: ImGui.DrawData): void {
	clearFramebuffer();
	const displayPosX = drawData.DisplayPos.x;
	const displayPosY = drawData.DisplayPos.y;

	drawData.IterateDrawLists((drawList: ImGui.DrawList): void => {
		drawList.IterateDrawCmds((drawCmd: ImGui.DrawCmd): void => {
			if (drawCmd.UserCallback !== null) {
				//FIXME: todo custom ImDrawCmd callbacks are ignored by the software renderer.
				return;
			}

			const textureId =
				typeof drawCmd.TextureId === "number" ? drawCmd.TextureId : 0;
			const texture = getTexture(textureId);
			if (texture === null && textureId !== 0) {
				//FIXME: todo non-registered ImTextureID values cannot currently be sampled by the NodeJS software renderer.
			}

			const clipMinX = Math.max(0, drawCmd.ClipRect.x - displayPosX);
			const clipMinY = Math.max(0, drawCmd.ClipRect.y - displayPosY);
			const clipMaxX = Math.min(
				runtime.options.displayWidth,
				drawCmd.ClipRect.z - displayPosX,
			);
			const clipMaxY = Math.min(
				runtime.options.displayHeight,
				drawCmd.ClipRect.w - displayPosY,
			);
			if (clipMinX >= clipMaxX || clipMinY >= clipMaxY) {
				return;
			}

			const indexBuffer =
				ImGui.DrawIdxSize === 4
					? new Uint32Array(
							drawList.IdxBuffer.buffer,
							drawList.IdxBuffer.byteOffset +
								drawCmd.IdxOffset * ImGui.DrawIdxSize,
							drawCmd.ElemCount,
						)
					: new Uint16Array(
							drawList.IdxBuffer.buffer,
							drawList.IdxBuffer.byteOffset +
								drawCmd.IdxOffset * ImGui.DrawIdxSize,
							drawCmd.ElemCount,
						);

			for (let i = 0; i + 2 < indexBuffer.length; i += 3) {
				const i0 = indexBuffer[i + 0];
				const i1 = indexBuffer[i + 1];
				const i2 = indexBuffer[i + 2];
				const v0 = new ImGui.DrawVert(
					drawList.VtxBuffer.buffer as ArrayBuffer,
					drawList.VtxBuffer.byteOffset + i0 * ImGui.DrawVertSize,
				);
				const v1 = new ImGui.DrawVert(
					drawList.VtxBuffer.buffer as ArrayBuffer,
					drawList.VtxBuffer.byteOffset + i1 * ImGui.DrawVertSize,
				);
				const v2 = new ImGui.DrawVert(
					drawList.VtxBuffer.buffer as ArrayBuffer,
					drawList.VtxBuffer.byteOffset + i2 * ImGui.DrawVertSize,
				);
				rasterizeTriangle(
					v0,
					v1,
					v2,
					texture,
					clipMinX,
					clipMinY,
					clipMaxX,
					clipMaxY,
					displayPosX,
					displayPosY,
				);
			}
		});
	});
}

async function uploadFramebuffer(): Promise<void> {
	if (runtime.outputTexture === null) {
		return;
	}
	const width = runtime.options.displayWidth;
	const height = runtime.options.displayHeight;
	const rowBytes = width * 4;
	for (let y = 0; y < height; y++) {
		const srcRowStart = y * rowBytes;
		const dstRowStart = (height - 1 - y) * rowBytes;
		runtime.uploadBuffer.set(
			runtime.framebuffer.subarray(srcRowStart, srcRowStart + rowBytes),
			dstRowStart,
		);
		for (let x = 0; x < width; x++) {
			runtime.uploadBuffer[dstRowStart + x * 4 + 3] = 255;
		}
	}
	await TextureManager.LoadRGBAImage(
		runtime.outputTexture,
		runtime.uploadBuffer,
		width,
		height,
	);
}

export function Init(options: AdamasInitOptions | null): void {
	if (options === null) {
		throw new Error("imgui_impl_adamas_node.Init requires a targetEntity");
	}
	if ((runtime.initialized || runtime.initializing) && !runtime.shutdown) {
		return;
	}
	runtime = createRuntime(options);

	const io = ImGui.GetIO();
	io.BackendPlatformName = "imgui_impl_adamas";
	io.BackendRendererName = "imgui_impl_adamas_node_rgba";
	io.DisplaySize.x = runtime.options.displayWidth;
	io.DisplaySize.y = runtime.options.displayHeight;
	io.DisplayFramebufferScale.x = 1;
	io.DisplayFramebufferScale.y = 1;
	io.SetClipboardTextFn = (_userData: unknown, text: string): void => {
		clipboardText = text;
		//FIXME: todo clipboard integration is in-memory only because the Adamas SDK typings do not expose a platform clipboard API.
	};
	io.GetClipboardTextFn = (): string => clipboardText;
	io.ClipboardUserData = null;
	//FIXME: todo keyboard input is not wired because the current public Adamas device API only exposes controller-style inputs.

	void ensureInitialized().catch((error) => {
		console.error("imgui_impl_adamas init failed", error);
	});
}

export function Shutdown(): void {
	runtime.shutdown = true;
	const subscriptions = [...runtime.subscriptions];
	runtime.subscriptions = [];
	void Promise.all(
		subscriptions.map((subscription) =>
			Device.UnsubscribeValueChange(subscription).catch(() => false),
		),
	)
		.then(async () => {
			if (runtime.outputTexture !== null) {
				await TextureManager.Destroy(runtime.outputTexture).catch(() => false);
			}
			if (runtime.targetMaterial !== null) {
				await MaterialManager.Destroy(runtime.targetMaterial).catch(
					() => false,
				);
			}
			runtime.initialized = false;
			runtime.outputTexture = null;
			runtime.targetMaterial = null;
			runtime.targetEntity = null;
			runtime.headEntity = null;
			runtime.leftHandEntity = null;
			runtime.rightHandEntity = null;
			runtime.textureRegistry.clear();
			runtime.fontTextureId = null;
		})
		.catch((error) => {
			console.error("imgui_impl_adamas shutdown failed", error);
		});
}

export function NewFrame(time: number): void {
	const io = ImGui.GetIO();
	io.DisplaySize.x = runtime.options.displayWidth;
	io.DisplaySize.y = runtime.options.displayHeight;
	io.DisplayFramebufferScale.x = 1;
	io.DisplayFramebufferScale.y = 1;
	io.DeltaTime = computeDeltaTime(time);

	io.MouseDown[0] =
		currentButtonValue(runtime.options.leftClickHand, "trigger") > 0.5;
	io.MouseDown[1] =
		currentButtonValue(runtime.options.rightClickHand, "trigger") > 0.5;
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

	if (!runtime.initialized) {
		io.MousePos.x = -Number.MAX_VALUE;
		io.MousePos.y = -Number.MAX_VALUE;
		return;
	}

	void runtime.renderQueue.then(async () => {
		if (!runtime.shutdown) {
			await updatePanelPose();
			await updateMouseFromHands();
		}
	});
}

export function RenderDrawData(
	drawData: ImGui.DrawData | null = ImGui.GetDrawData(),
): void {
	if (drawData === null || runtime.shutdown) {
		return;
	}
	renderCpu(drawData);
	runtime.renderQueue = runtime.renderQueue
		.then(async () => {
			await ensureInitialized();
			await uploadFramebuffer();
		})
		.catch((error) => {
			console.error("imgui_impl_adamas RenderDrawData failed", error);
		});
}
