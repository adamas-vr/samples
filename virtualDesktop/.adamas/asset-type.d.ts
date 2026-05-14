
declare module "adamasvr:editor" {
	import { UUID } from "crypto";
	export const projectBundle: import("@adamasvr/sdk").ProjectBundle;
}
declare module "adamasvr:assets/quad.amesh" {
	const value: import("@adamasvr/sdk").MeshAsset;
	export default value;
}
declare module "adamasvr:assets/screen.amat" {
	const value: import("@adamasvr/sdk").MaterialAsset;
	export default value;
}
declare module "adamasvr:assets/imgui.amat" {
	const value: import("@adamasvr/sdk").MaterialAsset;
	export default value;
}
declare module "adamasvr:assets/cube.amesh" {
	const value: import("@adamasvr/sdk").MeshAsset;
	export default value;
}
declare module "adamasvr:assets/debug.amat" {
	const value: import("@adamasvr/sdk").MaterialAsset;
	export default value;
}