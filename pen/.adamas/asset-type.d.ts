
declare module "adamasvr:editor" {
	import { UUID } from "crypto";
	export const projectBundle: import("@adamasvr/sdk").ProjectBundle;
}
declare module "adamasvr:assets/capsule.amesh" {
	const value: import("@adamasvr/sdk").MeshAsset;
	export default value;
}
declare module "adamasvr:assets/pen.amat" {
	const value: import("@adamasvr/sdk").MaterialAsset;
	export default value;
}
declare module "adamasvr:assets/cylinder.amesh" {
	const value: import("@adamasvr/sdk").MeshAsset;
	export default value;
}
declare module "adamasvr:assets/sphere.amesh" {
	const value: import("@adamasvr/sdk").MeshAsset;
	export default value;
}
declare module "adamasvr:assets/tip.amat" {
	const value: import("@adamasvr/sdk").MaterialAsset;
	export default value;
}