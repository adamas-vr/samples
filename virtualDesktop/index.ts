import {
	MaterialManager,
	MaterialProperty,
	Project,
	RenderableManager,
	SceneGraph,
	TextureFormat,
	TextureManager,
	TransformManager,
	Device,
	DevicePath,
	type DeviceSubscription,
	type Entity,
	User,
} from "@adamasvr/sdk";
import { projectBundle } from "adamasvr:editor";
import { execFileSync } from "node:child_process";
import { quat, vec3, vec4 } from "gl-matrix";
import sharp = require("sharp");
import robot from "robotjs";
import { CreateImGuiWindow } from "imgui-adamas";

type Hand = "left" | "right";

type ScreenSize = {
	width: number;
	height: number;
};

type ScreenPoint = {
	x: number;
	y: number;
};

type DisplayState = {
	entity: Entity;
	scale: vec3;
};

type ControllerInput = {
	leftTrigger: number;
	rightTrigger: number;
};

type ByteSample = {
	timeMs: number;
	bytes: number;
};

type CaptureStageMetrics = {
	captureMs: number;
	cursorMs: number;
	compressMs: number;
	loadMs: number;
	totalMs: number;
};

type CaptureStageHistory = {
	capture: number[];
	cursor: number[];
	compress: number[];
	load: number[];
	total: number[];
};

type PreparedCaptureUpload = {
	data: Uint8Array;
	width: number;
	height: number;
	payloadBytes: number;
};

function getWindowsPhysicalScreenSize(): ScreenSize | undefined {
	if (process.platform !== "win32") {
		return undefined;
	}

	const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class NativeDisplay {
	[DllImport("user32.dll")]
	public static extern IntPtr GetDC(IntPtr hwnd);

	[DllImport("user32.dll")]
	public static extern int ReleaseDC(IntPtr hwnd, IntPtr hdc);

	[DllImport("gdi32.dll")]
	public static extern int GetDeviceCaps(IntPtr hdc, int index);
}
"@

$dc = [NativeDisplay]::GetDC([IntPtr]::Zero)
try {
	[pscustomobject]@{
		width = [NativeDisplay]::GetDeviceCaps($dc, 118)
		height = [NativeDisplay]::GetDeviceCaps($dc, 117)
	} | ConvertTo-Json -Compress
} finally {
	[void][NativeDisplay]::ReleaseDC([IntPtr]::Zero, $dc)
}
`;

	try {
		const output = execFileSync(
			"powershell.exe",
			["-NoProfile", "-NonInteractive", "-Command", script],
			{ encoding: "utf8", windowsHide: true },
		);
		const size = JSON.parse(output.trim()) as ScreenSize;

		if (
			Number.isFinite(size.width) &&
			Number.isFinite(size.height) &&
			size.width > 0 &&
			size.height > 0
		) {
			return size;
		}
	} catch (error) {
		console.warn("Failed to read physical Windows screen size", error);
	}

	return undefined;
}

function getCaptureScreenSize(robotSize: ScreenSize): ScreenSize {
	const physicalSize = getWindowsPhysicalScreenSize();

	if (
		physicalSize !== undefined &&
		(physicalSize.width > robotSize.width ||
			physicalSize.height > robotSize.height)
	) {
		return physicalSize;
	}

	return robotSize;
}

const robotScreenSize = robot.getScreenSize();
const screenSize = getCaptureScreenSize(robotScreenSize);
const screenWidth = screenSize.width;
const screenHeight = screenSize.height;
const mouseScaleX = screenWidth / robotScreenSize.width;
const mouseScaleY = screenHeight / robotScreenSize.height;
const cursorIntervalMs = 1000 / 60;
const triggerClickThreshold = 0.8;
const metricsWindowMs = 1000;
const metricsHistoryLength = 180;

let screenTexture: number | undefined;
let screenTextureWidth = 0;
let screenTextureHeight = 0;
let screenMaterial: number | undefined;
let captureTimer: ReturnType<typeof setTimeout> | undefined;
let cursorTimer: ReturnType<typeof setInterval> | undefined;
let uploadInFlight = false;
let displayState: DisplayState | undefined;
let leftHandEntity: Entity | undefined;
let rightHandEntity: Entity | undefined;
let preferredHand: Hand | undefined;
let vrCursorPosition: ScreenPoint | undefined;
let primaryButtonDown = false;
let vrCursorUpdateInFlight = false;
let intendedCaptureFps = 60;
let emissionStrength = 1.1;
let captureRegionScale = 1;
let jpegQuality = 50;
let streamRgba = false;
const deviceSubscriptions: DeviceSubscription[] = [];
const controllerInput: ControllerInput = {
	leftTrigger: 0,
	rightTrigger: 0,
};
const completedCaptureTimesMs: number[] = [];
const captureStageHistory: CaptureStageHistory = {
	capture: [],
	cursor: [],
	compress: [],
	load: [],
	total: [],
};
const payloadByteSamples: ByteSample[] = [];

function getCaptureIntervalMs(): number {
	return 1000 / intendedCaptureFps;
}

function getRobotCaptureWidth(): number {
	return Math.max(1, Math.round(screenWidth * captureRegionScale));
}

function getRobotCaptureHeight(): number {
	return Math.max(1, Math.round(screenHeight * captureRegionScale));
}

function pruneOldSamples(nowMs: number): void {
	while (
		completedCaptureTimesMs.length > 0 &&
		nowMs - completedCaptureTimesMs[0] > metricsWindowMs
	) {
		completedCaptureTimesMs.shift();
	}

	while (
		payloadByteSamples.length > 0 &&
		nowMs - payloadByteSamples[0].timeMs > metricsWindowMs
	) {
		payloadByteSamples.shift();
	}
}

function appendMetric(history: number[], value: number): void {
	history.push(value);

	if (history.length > metricsHistoryLength) {
		history.splice(0, history.length - metricsHistoryLength);
	}
}

function recordCaptureMetrics(
	payloadBytes: number,
	stageMetrics: CaptureStageMetrics,
): void {
	const nowMs = Date.now();
	completedCaptureTimesMs.push(nowMs);
	appendMetric(captureStageHistory.capture, stageMetrics.captureMs);
	appendMetric(captureStageHistory.cursor, stageMetrics.cursorMs);
	appendMetric(captureStageHistory.compress, stageMetrics.compressMs);
	appendMetric(captureStageHistory.load, stageMetrics.loadMs);
	appendMetric(captureStageHistory.total, stageMetrics.totalMs);
	payloadByteSamples.push({
		timeMs: nowMs,
		bytes: payloadBytes,
	});

	pruneOldSamples(nowMs);
}

function getRealtimeCaptureFps(): number {
	const nowMs = Date.now();
	pruneOldSamples(nowMs);
	return (completedCaptureTimesMs.length * 1000) / metricsWindowMs;
}

function getRpcThroughputBytesPerSecond(): number {
	const nowMs = Date.now();
	pruneOldSamples(nowMs);
	return payloadByteSamples.reduce((total, sample) => total + sample.bytes, 0);
}

function getLatestPayloadBytes(): number {
	return payloadByteSamples.length === 0
		? 0
		: payloadByteSamples[payloadByteSamples.length - 1].bytes;
}

function getLatestMetric(history: number[]): number {
	return history.length === 0 ? 0 : history[history.length - 1];
}

function getCapturePlotMaxMs(): number {
	const values = [
		...captureStageHistory.capture,
		...captureStageHistory.cursor,
		...captureStageHistory.compress,
		...captureStageHistory.load,
		...captureStageHistory.total,
	];

	return Math.max(1, ...values) * 1.2;
}

function formatBytes(bytes: number): string {
	if (bytes >= 1024 * 1024) {
		return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
	}

	if (bytes >= 1024) {
		return `${(bytes / 1024).toFixed(1)} KB`;
	}

	return `${bytes.toFixed(0)} B`;
}

function makeEmissionColor(): vec4 {
	return vec4.fromValues(
		emissionStrength,
		emissionStrength,
		emissionStrength,
		1,
	);
}

function applyEmissionStrength(): void {
	if (screenMaterial === undefined) {
		return;
	}

	void MaterialManager.SetColor(
		screenMaterial,
		MaterialProperty.Emission,
		makeEmissionColor(),
	).catch((error) => {
		console.error("Failed to update emission strength", error);
	});
}

async function prepareCaptureUpload(
	bgrx: Buffer,
	width: number,
	height: number,
): Promise<PreparedCaptureUpload> {
	const jpeg = await sharp(bgrx, {
		raw: {
			width,
			height,
			channels: 4,
		},
	})
		.jpeg({ quality: jpegQuality })
		.toBuffer();

	return {
		data: new Uint8Array(jpeg),
		width,
		height,
		payloadBytes: jpeg.byteLength,
	};
}

function setCapturePixel(
	bgrx: Uint8Array,
	width: number,
	height: number,
	x: number,
	y: number,
	color: [number, number, number, number],
): void {
	if (x < 0 || x >= width || y < 0 || y >= height) {
		return;
	}

	const index = (y * width + x) * 4;
	bgrx[index] = color[0];
	bgrx[index + 1] = color[1];
	bgrx[index + 2] = color[2];
	bgrx[index + 3] = color[3];
}

function isPointInPolygon(point: ScreenPoint, polygon: ScreenPoint[]): boolean {
	let inside = false;

	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const current = polygon[i];
		const previous = polygon[j];
		const crossesY = current.y > point.y !== previous.y > point.y;

		if (
			crossesY &&
			point.x <
				((previous.x - current.x) * (point.y - current.y)) /
					(previous.y - current.y) +
					current.x
		) {
			inside = !inside;
		}
	}

	return inside;
}

function drawFilledPolygon(
	bgrx: Uint8Array,
	width: number,
	height: number,
	polygon: ScreenPoint[],
	color: [number, number, number, number],
): void {
	const minX = Math.floor(Math.min(...polygon.map((point) => point.x)));
	const maxX = Math.ceil(Math.max(...polygon.map((point) => point.x)));
	const minY = Math.floor(Math.min(...polygon.map((point) => point.y)));
	const maxY = Math.ceil(Math.max(...polygon.map((point) => point.y)));

	for (let y = minY; y <= maxY; y++) {
		for (let x = minX; x <= maxX; x++) {
			if (isPointInPolygon({ x: x + 0.5, y: y + 0.5 }, polygon)) {
				setCapturePixel(bgrx, width, height, x, y, color);
			}
		}
	}
}

function getCursorPosition(): ScreenPoint {
	if (vrCursorPosition !== undefined) {
		return vrCursorPosition;
	}

	const mouse = robot.getMousePos();

	return {
		x: Math.round(mouse.x * mouseScaleX),
		y: Math.round(mouse.y * mouseScaleY),
	};
}

function scaleCursorPolygon(
	polygon: ScreenPoint[],
	scaleX: number,
	scaleY: number,
): ScreenPoint[] {
	return polygon.map((point) => ({
		x: Math.round(point.x * scaleX),
		y: Math.round(point.y * scaleY),
	}));
}

function drawCursor(
	bgrx: Uint8Array,
	width: number,
	height: number,
	sourceWidth = width,
	sourceHeight = height,
): void {
	const cursor = getCursorPosition();
	const outline = [
		{ x: cursor.x, y: cursor.y },
		{ x: cursor.x, y: cursor.y + 24 },
		{ x: cursor.x + 6, y: cursor.y + 18 },
		{ x: cursor.x + 11, y: cursor.y + 27 },
		{ x: cursor.x + 16, y: cursor.y + 24 },
		{ x: cursor.x + 11, y: cursor.y + 16 },
		{ x: cursor.x + 21, y: cursor.y + 16 },
	];
	const fill = [
		{ x: cursor.x + 2, y: cursor.y + 4 },
		{ x: cursor.x + 2, y: cursor.y + 19 },
		{ x: cursor.x + 6, y: cursor.y + 14 },
		{ x: cursor.x + 12, y: cursor.y + 24 },
		{ x: cursor.x + 13, y: cursor.y + 23 },
		{ x: cursor.x + 8, y: cursor.y + 13 },
		{ x: cursor.x + 15, y: cursor.y + 14 },
	];
	const scaleX = width / sourceWidth;
	const scaleY = height / sourceHeight;

	drawFilledPolygon(
		bgrx,
		width,
		height,
		scaleCursorPolygon(outline, scaleX, scaleY),
		[0, 0, 0, 255],
	);
	drawFilledPolygon(
		bgrx,
		width,
		height,
		scaleCursorPolygon(fill, scaleX, scaleY),
		[255, 255, 255, 255],
	);
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function getTriggerValue(hand: Hand): number {
	return hand === "left"
		? controllerInput.leftTrigger
		: controllerInput.rightTrigger;
}

function setPrimaryButtonDown(isDown: boolean): void {
	if (primaryButtonDown === isDown) {
		return;
	}

	primaryButtonDown = isDown;
	robot.mouseToggle(isDown ? "down" : "up", "left");
}

function moveMouseToScreenPoint(point: ScreenPoint): void {
	robot.moveMouse(
		Math.round(point.x / mouseScaleX),
		Math.round(point.y / mouseScaleY),
	);
}

async function subscribeDeviceValue(
	devicePath: string,
	setter: (value: number) => void,
): Promise<void> {
	const value = await Device.GetValue(devicePath);
	if (typeof value === "number") {
		setter(value);
	}

	const subscription = await Device.SubscribeValueChange(
		devicePath,
		(value) => {
			if (typeof value === "number") {
				setter(value);
			}
		},
	);
	deviceSubscriptions.push(subscription);
}

async function initializeControllerInput(): Promise<void> {
	const localUser = await User.GetLocalUser();
	leftHandEntity = await localUser.GetLeftHandEntity();
	rightHandEntity = await localUser.GetRightHandEntity();

	await subscribeDeviceValue(
		DevicePath.LEFT_TRIGGER,
		(value) => (controllerInput.leftTrigger = value),
	);
	await subscribeDeviceValue(
		DevicePath.RIGHT_TRIGGER,
		(value) => (controllerInput.rightTrigger = value),
	);
}

async function intersectHand(hand: Hand): Promise<ScreenPoint | undefined> {
	if (displayState === undefined) {
		return undefined;
	}

	const handEntity = hand === "left" ? leftHandEntity : rightHandEntity;

	if (handEntity === undefined) {
		return undefined;
	}

	const [handPosition, handRotation, displayPosition, displayRotation] =
		await Promise.all([
			TransformManager.GetWorldPosition(handEntity),
			TransformManager.GetWorldRotation(handEntity),
			TransformManager.GetWorldPosition(displayState.entity),
			TransformManager.GetWorldRotation(displayState.entity),
		]);

	const direction = vec3.normalize(
		vec3.create(),
		vec3.transformQuat(vec3.create(), vec3.fromValues(0, 0, -1), handRotation),
	);
	const planeNormal = vec3.transformQuat(
		vec3.create(),
		vec3.fromValues(0, 0, 1),
		displayRotation,
	);
	const denominator = vec3.dot(direction, planeNormal);

	if (Math.abs(denominator) < 1e-5) {
		return undefined;
	}

	const originToPlane = vec3.sub(vec3.create(), displayPosition, handPosition);
	const distance = vec3.dot(originToPlane, planeNormal) / denominator;

	if (distance <= 0) {
		return undefined;
	}

	const hit = vec3.scaleAndAdd(
		vec3.create(),
		handPosition,
		direction,
		distance,
	);
	const displayLocal = vec3.sub(vec3.create(), hit, displayPosition);
	const inverseRotation = quat.invert(quat.create(), displayRotation);

	if (inverseRotation === null) {
		return undefined;
	}

	vec3.transformQuat(displayLocal, displayLocal, inverseRotation);

	const x = (displayLocal[0] / displayState.scale[0] + 0.5) * screenWidth;
	const y = (displayLocal[1] / displayState.scale[1] + 0.5) * screenHeight;

	if (x < 0 || x > screenWidth || y < 0 || y > screenHeight) {
		return undefined;
	}

	return {
		x: clamp(Math.round(x), 0, screenWidth - 1),
		y: clamp(Math.round(y), 0, screenHeight - 1),
	};
}

function updatePreferredHand(
	intersections: Record<Hand, ScreenPoint | undefined>,
): void {
	if (intersections.left === undefined && intersections.right === undefined) {
		preferredHand = undefined;
		return;
	}

	if (intersections.left === undefined && intersections.right !== undefined) {
		preferredHand = "right";
		return;
	}

	if (intersections.left !== undefined && intersections.right === undefined) {
		preferredHand = "left";
		return;
	}

	const otherHand = preferredHand === "left" ? "right" : "left";
	if (
		intersections[otherHand] !== undefined &&
		getTriggerValue(otherHand) > triggerClickThreshold
	) {
		preferredHand = otherHand;
	}
}

async function updateVrCursor(): Promise<void> {
	if (vrCursorUpdateInFlight) {
		return;
	}

	vrCursorUpdateInFlight = true;

	try {
		const [leftIntersection, rightIntersection] = await Promise.all([
			intersectHand("left"),
			intersectHand("right"),
		]);
		const intersections = {
			left: leftIntersection,
			right: rightIntersection,
		};

		updatePreferredHand(intersections);

		const hit =
			preferredHand === undefined ? undefined : intersections[preferredHand];

		vrCursorPosition = hit;

		if (preferredHand === undefined || hit === undefined) {
			setPrimaryButtonDown(false);
			return;
		}

		moveMouseToScreenPoint(hit);
		setPrimaryButtonDown(
			getTriggerValue(preferredHand) > triggerClickThreshold,
		);
	} finally {
		vrCursorUpdateInFlight = false;
	}
}

function startCursorLoop(): void {
	if (cursorTimer !== undefined) {
		return;
	}

	cursorTimer = setInterval(() => {
		void updateVrCursor().catch((error) => {
			console.error("Failed to update VR cursor", error);
			vrCursorPosition = undefined;
			preferredHand = undefined;
			setPrimaryButtonDown(false);
		});
	}, cursorIntervalMs);
}

async function createScreenQuad(sceneGraph: SceneGraph): Promise<void> {
	const screenEntity = sceneGraph["@Display"].entityId;
	const displayScale = vec3.fromValues(1, screenHeight / screenWidth, 1);
	displayState = {
		entity: screenEntity,
		scale: displayScale,
	};

	await TransformManager.SetLocalScale(screenEntity, displayScale);

	const material = await RenderableManager.GetMaterial(screenEntity);
	screenMaterial = material;
	screenTexture = await TextureManager.Create2D(
		screenWidth,
		screenHeight,
		TextureFormat.BGRA32,
	);
	screenTextureWidth = screenWidth;
	screenTextureHeight = screenHeight;
	await MaterialManager.SetTexture(
		material,
		MaterialProperty.BaseColorMap,
		screenTexture,
	);
	await MaterialManager.SetTexture(
		material,
		MaterialProperty.EmissionMap,
		screenTexture,
	);
	await MaterialManager.SetColor(
		material,
		MaterialProperty.Emission,
		makeEmissionColor(),
	);
}

async function ensureRgbaTextureSize(width: number, height: number): Promise<number> {
	if (
		screenTexture !== undefined &&
		screenTextureWidth === width &&
		screenTextureHeight === height
	) {
		return screenTexture;
	}

	if (screenMaterial === undefined) {
		throw new Error("Screen material is not initialized");
	}

	const previousTexture = screenTexture;
	const texture = await TextureManager.Create2D(
		width,
		height,
		TextureFormat.RGBA32,
	);
	screenTexture = texture;
	screenTextureWidth = width;
	screenTextureHeight = height;

	await MaterialManager.SetTexture(
		screenMaterial,
		MaterialProperty.BaseColorMap,
		texture,
	);
	await MaterialManager.SetTexture(
		screenMaterial,
		MaterialProperty.EmissionMap,
		texture,
	);

	if (previousTexture !== undefined) {
		void TextureManager.Destroy(previousTexture).catch((error) => {
			console.error("Failed to destroy previous screen texture", error);
		});
	}

	return texture;
}

function startCaptureLoop(): void {
	if (screenTexture === undefined || captureTimer !== undefined) {
		return;
	}

	const tick = () => {
		captureTimer = setTimeout(tick, getCaptureIntervalMs());

		if (screenTexture === undefined || uploadInFlight) {
			return;
		}

		let texture = screenTexture;
		uploadInFlight = true;

		void (async () => {
			const totalStartMs = performance.now();
			const captureStartMs = performance.now();
			const capture = robot.screen.capture(
				0,
				0,
				getRobotCaptureWidth(),
				getRobotCaptureHeight(),
			);
			const captureEndMs = performance.now();
			const cursorStartMs = performance.now();
			drawCursor(
				capture.image,
				capture.width,
				capture.height,
				screenWidth,
				screenHeight,
			);
			const cursorEndMs = performance.now();
			const compressStartMs = performance.now();
			const upload = streamRgba
				? {
						data: new Uint8Array(capture.image),
						width: capture.width,
						height: capture.height,
						payloadBytes: capture.image.byteLength,
					}
				: await prepareCaptureUpload(
						capture.image,
						capture.width,
						capture.height,
					);
			const compressEndMs = performance.now();

			const loadStartMs = performance.now();
			if (streamRgba) {
				texture = await ensureRgbaTextureSize(upload.width, upload.height);
				await TextureManager.LoadRGBAImage(
					texture,
					upload.data,
					upload.width,
					upload.height,
				);
			} else {
				await TextureManager.LoadImage(texture, upload.data);
			}
			const loadEndMs = performance.now();
			recordCaptureMetrics(upload.payloadBytes, {
				captureMs: captureEndMs - captureStartMs,
				cursorMs: cursorEndMs - cursorStartMs,
				compressMs: compressEndMs - compressStartMs,
				loadMs: loadEndMs - loadStartMs,
				totalMs: loadEndMs - totalStartMs,
			});
		})()
			.catch((error) => {
				console.error("Failed to upload desktop capture", error);
			})
			.finally(() => {
				uploadInFlight = false;
			});
	};

	tick();
}

async function createDebugWindow(sceneGraph: SceneGraph): Promise<void> {
	const controllerEntity = sceneGraph["@controller"].entityId;

	await CreateImGuiWindow(
		{
			targetEntity: controllerEntity,
			displayWidth: 640,
			displayHeight: 480,
			styleColor: "dark",
			clearColor: [0.02, 0.02, 0.025, 1],
			fontSizePx: 14,
		},
		(ImGui) => {
			const realtimeFps = getRealtimeCaptureFps();
			const throughputBytesPerSecond = getRpcThroughputBytesPerSecond();
			const plotMaxMs = getCapturePlotMaxMs();
			const latestPayloadBytes = getLatestPayloadBytes();
			const plotStage = (
				label: string,
				history: number[],
				graphWidth: number,
			) => {
				const latestMs = getLatestMetric(history);
				ImGui.PlotLines(
					label,
					history,
					history.length,
					0,
					`${latestMs.toFixed(1)} ms`,
					0,
					plotMaxMs,
					new ImGui.Vec2(graphWidth, 48),
				);
			};

			ImGui.Text("Virtual Desktop Capture");
			ImGui.Separator();

			ImGui.Text("Capture pacing");
			const fpsValue: [number] = [intendedCaptureFps];
			ImGui.SetNextItemWidth(360);
			if (
				ImGui.SliderFloat(
					"Intended FPS",
					fpsValue,
					1,
					90,
					"%.0f",
					ImGui.SliderFlags.AlwaysClamp,
				)
			) {
				intendedCaptureFps = clamp(fpsValue[0], 1, 90);
			}
			ImGui.Text(`Target interval: ${getCaptureIntervalMs().toFixed(2)} ms`);
			ImGui.Text(
				`Realtime FPS: ${realtimeFps.toFixed(1)} ` +
					`(actual completed capture/upload rate)`,
			);

			ImGui.Separator();
			ImGui.Text("JPEG upload");
			const streamRgbaValue: [boolean] = [streamRgba];
			if (ImGui.Checkbox("Stream raw RGBA", streamRgbaValue)) {
				streamRgba = streamRgbaValue[0];
			}
			const qualityValue: [number] = [jpegQuality];
			ImGui.SetNextItemWidth(360);
			if (
				ImGui.SliderFloat(
					"Quality",
					qualityValue,
					10,
					95,
					"%.0f",
					ImGui.SliderFlags.AlwaysClamp,
				)
			) {
				jpegQuality = Math.round(clamp(qualityValue[0], 10, 95));
			}
			const captureRegionValue: [number] = [captureRegionScale];
			ImGui.SetNextItemWidth(360);
			if (
				ImGui.SliderFloat(
					"Robot capture scale",
					captureRegionValue,
					0.25,
					1,
					"%.2f",
					ImGui.SliderFlags.AlwaysClamp,
				)
			) {
				captureRegionScale = clamp(captureRegionValue[0], 0.25, 1);
			}
			ImGui.Text(
				`Robot capture: ${getRobotCaptureWidth()}x${getRobotCaptureHeight()}`,
			);
			ImGui.Text(
				`Upload size: ${getRobotCaptureWidth()}x${getRobotCaptureHeight()}`,
			);

			ImGui.Separator();
			ImGui.Text("RPC throughput");
			ImGui.Text(`Payload buffer: ${formatBytes(latestPayloadBytes)}`);
			ImGui.Text(`Payload rate: ${formatBytes(throughputBytesPerSecond)}/s`);

			ImGui.Separator();
			ImGui.Text("Visual output");
			const emissionValue: [number] = [emissionStrength];
			ImGui.SetNextItemWidth(360);
			if (
				ImGui.SliderFloat(
					"Emission strength",
					emissionValue,
					0,
					3,
					"%.2f",
					ImGui.SliderFlags.AlwaysClamp,
				)
			) {
				emissionStrength = clamp(emissionValue[0], 0, 3);
				applyEmissionStrength();
			}

			ImGui.Separator();
			ImGui.Text("Capture stage time");
			ImGui.Text(`Scale: 0-${plotMaxMs.toFixed(1)} ms`);
			plotStage("capture", captureStageHistory.capture, 245);
			ImGui.SameLine();
			plotStage("cursor", captureStageHistory.cursor, 245);
			plotStage("encode", captureStageHistory.compress, 245);
			ImGui.SameLine();
			plotStage("loadImage", captureStageHistory.load, 245);
			plotStage("total", captureStageHistory.total, 520);
		},
	);
}

Project.FromBundle(projectBundle).Launch({
	OnSetup: async (_, sceneGraph) => {
		await createScreenQuad(sceneGraph);
		await createDebugWindow(sceneGraph);
		await initializeControllerInput();
		startCursorLoop();
		startCaptureLoop();
		console.log(
			`Streaming ${screenWidth}x${screenHeight} desktop capture to the screen quad`,
		);
	},
	OnTick: () => {},
});
