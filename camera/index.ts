import {
	CameraManager,
	GrabInteractableManager,
	MaterialManager,
	MaterialProperty,
	Project,
	RenderableManager,
	RenderTextureFormat,
	TextureDimension,
	TextureFormat,
	TextureManager,
} from "@adamasvr/sdk";
import { projectBundle } from "adamasvr:editor";

Project.FromBundle(projectBundle).Launch({
	OnSetup: async (project, sceneGraph) => {
		if (sceneGraph === undefined) return;
		const display = sceneGraph["@Display"]["@Preview"].entityId;
		const camera = sceneGraph["@Camera"]["@Film"].entityId;
		const capture = sceneGraph["@Display"]["@Capture"].entityId;
		const button = sceneGraph["@Camera"].entityId;

		const renderTexture = await TextureManager.CreateRenderTexture(900, 1200);

		CameraManager.SetRenderTexture(camera, renderTexture);
		const previewMat = await RenderableManager.GetMaterial(display, 0);
		MaterialManager.SetTexture(
			previewMat,
			MaterialProperty.BaseColorMap,
			renderTexture,
		);

		const tex = await TextureManager.Create2D(1, 1, TextureFormat.RGBA32);
		const captureMat = await RenderableManager.GetMaterial(capture, 0);
		MaterialManager.SetTexture(captureMat, MaterialProperty.BaseColorMap, tex);

		GrabInteractableManager.AddActivatedCallback(button, async () => {
			const result = await TextureManager.ReadbackJPGImage(renderTexture);
			TextureManager.LoadImage(tex, result.data);
		});
	},
	OnTick: (project, timestep) => {},
});
