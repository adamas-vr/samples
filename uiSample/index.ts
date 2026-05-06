import { Project } from "@adamasvr/sdk";
import { projectBundle } from "adamasvr:editor";

import * as imgui from "imgui-adamas";

Project.FromBundle(projectBundle).Launch({
	OnSetup: async (project, sceneGraph) => {
		console.log(JSON.stringify(imgui));
	},
	OnTick: (project, timestep) => {},
});
