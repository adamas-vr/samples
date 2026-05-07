import { EntityManager, Project, TransformManager } from "@adamasvr/sdk";
import { projectBundle } from "adamasvr:editor";
import { vec3 } from "gl-matrix";
import { CreateImGuiWindow } from "./imgui_window";

Project.FromBundle(projectBundle).Launch({
	OnSetup: async () => {
		const uiEntity = await EntityManager.Create("ImGui Host");
		await TransformManager.SetLocalScale(uiEntity, vec3.fromValues(0.64, 0.36, 1));
		await TransformManager.SetLocalPosition(uiEntity, vec3.fromValues(0, 1.0, 0));

		await CreateImGuiWindow({
			initOptions: {
				targetEntity: uiEntity,
				displayWidth: 1280,
				displayHeight: 720,
			},
			ui: (imgui) => {
				imgui.Text("ImGui UI wrapper");
				imgui.Separator();
				imgui.Text("Pass UI commands to CreateImGuiWindow({ ui }) here.");
			},
		});
	},
});
