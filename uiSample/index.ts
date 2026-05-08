import {
	MaterialManager,
	MaterialProperty,
	Project,
	RenderableManager,
	type Material,
} from "@adamasvr/sdk";
import { projectBundle } from "adamasvr:editor";
import { CreateImGuiWindow } from "imgui-adamas";
import { vec4 } from "gl-matrix";

const cubeColor = { r: 0.2, g: 0.45, b: 1, a: 1 };
let cubeMaterial: Material | null = null;
let cubeColorUpdate = Promise.resolve();

Project.FromBundle(projectBundle).Launch({
	OnSetup: async (_, sceneGraph) => {
		const cubeEntity = sceneGraph["@cube"].entityId;
		cubeMaterial = await RenderableManager.GetMaterial(cubeEntity);
		await MaterialManager.SetColor(
			cubeMaterial,
			MaterialProperty.BaseColor,
			vec4.fromValues(cubeColor.r, cubeColor.g, cubeColor.b, cubeColor.a),
		);

		await CreateImGuiWindow(
			{
				targetEntity: sceneGraph["@UI Panel"].entityId,
				displayWidth: 600,
				displayHeight: 400,
			},
			(imgui) => {
				imgui.Text("Cube color");
				imgui.Separator();
				if (
					imgui.ColorEdit4("Base color", cubeColor) &&
					cubeMaterial !== null
				) {
					const nextColor = vec4.fromValues(
						cubeColor.r,
						cubeColor.g,
						cubeColor.b,
						cubeColor.a,
					);
					cubeColorUpdate = cubeColorUpdate.then(() =>
						MaterialManager.SetColor(
							cubeMaterial!,
							MaterialProperty.BaseColor,
							nextColor,
						),
					);
				}
			},
		);
	},
});
