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
		const display = sceneGraph["@Display"]["@New Entity"].entityId;
		const camera = sceneGraph["@Camera"]["@Film"].entityId;
		// const button = sceneGraph["@grabble"]["@button"].entityId;

		const renderTexture = await TextureManager.CreateRenderTexture(
			900,
			1200,
			16,
			TextureDimension.Tex2D,
			RenderTextureFormat.DefaultHDR,
		);

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

		GrabInteractableManager.AddSelectEnteredCallback(camera, async () => {
			const result = await TextureManager.ReadbackRGBAImage(renderTexture);
			TextureManager.LoadRGBAImage(
				tex,
				result.data,
				result.width,
				result.height,
			);

			const size = TextureManager.GetTextureSize(renderTexture);
			console.log(`Texture size ${size}`);
			// TextureManager.LoadImage(tex, result.base64);

			const rgba = TextureManager.ReadbackRGBAImage(renderTexture);
			console.log(
				`[RGBA data] Rect:<${rgba.width},${rgba.height}>; base65.length=${rgba.base64.length}`,
			);
		});
	},
	OnTick: (project, timestep) => {},
});
