import {
	MaterialManager,
	MaterialProperty,
	Project,
	RenderableManager,
	SceneGraph,
	TextureFormat,
	TextureManager,
	TransformManager,
} from "@adamasvr/sdk";
import { projectBundle } from "adamasvr:editor";
import { vec3 } from "gl-matrix";
import robot from "robotjs";

const screenSize = robot.getScreenSize();
const screenWidth = screenSize.width;
const screenHeight = screenSize.height;
const captureIntervalMs = 100;

let screenTexture: number | undefined;
let captureTimer: ReturnType<typeof setInterval> | undefined;
let uploadInFlight = false;

function convertBgrxToRgba(input: Buffer): Uint8Array {
	const rgba = new Uint8Array(input.length);

	for (let i = 0; i < input.length; i += 4) {
		rgba[i] = input[i + 2];
		rgba[i + 1] = input[i + 1];
		rgba[i + 2] = input[i];
		rgba[i + 3] = 255;
	}

	return rgba;
}

async function createScreenQuad(sceneGraph: SceneGraph): Promise<void> {
	const screenEntity = sceneGraph["@Display"].entityId;

	await TransformManager.SetLocalScale(
		screenEntity,
		vec3.fromValues(1, -screenHeight / screenWidth, 1),
	);

	const material = await RenderableManager.GetMaterial(screenEntity);
	screenTexture = await TextureManager.Create2D(
		screenWidth,
		screenHeight,
		TextureFormat.RGBA32,
	);
	await MaterialManager.SetTexture(
		material,
		MaterialProperty.BaseColorMap,
		screenTexture,
	);
}

function startCaptureLoop(): void {
	if (screenTexture === undefined || captureTimer !== undefined) {
		return;
	}

	captureTimer = setInterval(() => {
		if (screenTexture === undefined || uploadInFlight) {
			return;
		}

		uploadInFlight = true;

		const capture = robot.screen.capture();
		const rgba = convertBgrxToRgba(capture.image);

		void TextureManager.LoadRGBAImage(
			screenTexture,
			rgba,
			capture.width,
			capture.height,
		)
			.catch((error) => {
				console.error("Failed to upload desktop capture", error);
			})
			.finally(() => {
				uploadInFlight = false;
			});
	}, captureIntervalMs);
}

Project.FromBundle(projectBundle).Launch({
	OnSetup: async (_, sceneGraph) => {
		await createScreenQuad(sceneGraph);
		startCaptureLoop();
		console.log(
			`Streaming ${screenWidth}x${screenHeight} desktop capture to the screen quad`,
		);
	},
	OnTick: () => {},
});
