import { EntityManager, Project, TransformManager } from "@adamasvr/sdk";
import { projectBundle } from "adamasvr:editor";

import * as ImGui from "imgui-adamas";
import * as ImGui_Impl from "./imgui_impl_adamas_node";
import { ShowDemoWindow } from "./imgui_demo";
import { vec3 } from "gl-matrix";

let show_demo_window = true;
let initialized = false;
let shutting_down = false;
let ui_entity: number | null = null;

Project.FromBundle(projectBundle).Launch({
	OnSetup: async (_project, _sceneGraph) => {
		await ImGui.default();
		ImGui.CHECKVERSION();
		ImGui.CreateContext();
		ui_entity = await EntityManager.Create("ImGui Host");
		await TransformManager.SetLocalScale(
			ui_entity,
			vec3.fromValues(0.64, 0.36, 1),
		);
		await TransformManager.SetLocalPosition(
			ui_entity,
			vec3.fromValues(0, 1.0, 0),
		);

		const io = ImGui.GetIO();
		io.Fonts.AddFontDefault();

		ImGui.StyleColorsDark();

		ImGui_Impl.Init({
			targetEntity: ui_entity,
			displayWidth: 1280,
			displayHeight: 720,
		});

		initialized = true;
	},
	OnTick: (_project, timestep) => {
		if (!initialized || shutting_down) {
			return;
		}

		ImGui_Impl.NewFrame(timestep);
		ImGui.NewFrame();

		ShowDemoWindow((value = show_demo_window) => (show_demo_window = value));

		ImGui.Render();
		ImGui_Impl.RenderDrawData(ImGui.GetDrawData());

		if (!show_demo_window) {
			shutting_down = true;
			ImGui_Impl.Shutdown();
			ImGui.DestroyContext();
			if (ui_entity !== null) {
				void EntityManager.Destroy(ui_entity);
				ui_entity = null;
			}
		}
	},
});
