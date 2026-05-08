import { EntityManager, Project, TransformManager } from "@adamasvr/sdk";
import { projectBundle } from "adamasvr:editor";
import { CreateImGuiWindow } from "./imgui_window";

Project.FromBundle(projectBundle).Launch({
	OnSetup: async (_, sceneGraph) => {
		await CreateImGuiWindow(
			{
				targetEntity: sceneGraph["@UI Panel"].entityId,
				noBackground: true,
				displayWidth: 600,
				displayHeight: 400,
			},
			(imgui) => {
				imgui.Text("ImGui UI wrapper");
				imgui.Separator();
				imgui.Text("Pass UI commands to CreateImGuiWindow({ ui }) here.");
			},
		);
	},
});
