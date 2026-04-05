import { Project } from "@adamasvr/sdk";
import { projectBundle } from "adamasvr:editor";

Project.FromBundle(projectBundle).Launch({
	OnSetup: (project, sceneGraph) => {},
	OnTick: (project, timestep) => {},
});
