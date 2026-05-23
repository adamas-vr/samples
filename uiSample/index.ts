import {
	MaterialManager,
	MaterialProperty,
	Networking,
	Project,
	RenderableManager,
	type Material,
} from "@adamasvr/sdk";
import { projectBundle } from "adamasvr:editor";
import { CreateImGuiWindow } from "@adamasvr/imgui";
import { vec4 } from "gl-matrix";

type CubeColor = { r: number; g: number; b: number; a: number };

const initialCubeColor: CubeColor = { r: 0.2, g: 0.45, b: 1, a: 1 };

Project.FromBundle(projectBundle).Launch(async (sceneGraph, project) => {
	const cubeEntity = sceneGraph["@cube"].entityId;
	const cubeMaterial = await RenderableManager.GetMaterial(cubeEntity);
	const cubeColor: CubeColor = { ...initialCubeColor };
	let cubeColorUpdate = Promise.resolve();

	const applyCubeColor = (nextColor: CubeColor) => {
		cubeColor.r = nextColor.r;
		cubeColor.g = nextColor.g;
		cubeColor.b = nextColor.b;
		cubeColor.a = nextColor.a;

		const targetMaterial: Material = cubeMaterial;
		const colorVector = vec4.fromValues(
			nextColor.r,
			nextColor.g,
			nextColor.b,
			nextColor.a,
		);
		cubeColorUpdate = cubeColorUpdate.then(() =>
			MaterialManager.SetColor(
				targetMaterial,
				MaterialProperty.BaseColor,
				colorVector,
			),
		);
	};

	const sharedCubeColor = Networking.NewVariable<CubeColor>(
		{ ...initialCubeColor },
		applyCubeColor,
	);

	await CreateImGuiWindow(
		project,
		{
			targetEntity: sceneGraph["@UI Panel"].entityId,
			displayWidth: 600,
			displayHeight: 400,
		},
		(imgui) => {
			imgui.Text(`Framerate: ${imgui.GetIO().Framerate.toFixed(1)} FPS`);
			imgui.Separator();
			imgui.Text("Cube color");
			imgui.Separator();
			if (imgui.ColorEdit4("Base color", cubeColor)) {
				sharedCubeColor.value = { ...cubeColor };
			}
		},
	);
});
