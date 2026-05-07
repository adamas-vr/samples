import { Project } from "@adamasvr/sdk";
import { projectBundle } from "adamasvr:editor";
import { CreateImGuiWindow } from "./imgui_window";

Project.FromBundle(projectBundle).Launch({
	OnSetup: async () => {
		await CreateImGuiWindow({
			uiInit: (imgui) => {
				const io = imgui.GetIO();
				io.FontGlobalScale = 1.25;
			},
			ui: (imgui) => {
				imgui.Text("ImGui UI wrapper");
				imgui.Separator();
				imgui.Text("Pass UI commands to CreateImGuiWindow({ ui }) here.");
			},
		});
	},
});
