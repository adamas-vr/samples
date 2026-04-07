import { Project } from "@adamasvr/sdk";
import { projectBundle } from "adamasvr:editor";

Project.FromBundle(projectBundle).Launch({
	OnSetup: async (project, sceneGraph) => {},
	OnTick: (project, timestep) => {},
});
