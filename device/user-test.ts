import { Networking, SceneGraph, User } from "@adamasvr/sdk";

const printUser = async (user: User) => {
	console.log(`UserId: ${user.GetUserId()}`);
	console.log(`IsValid: ${await user.IsValid()}`);
	console.log(`IsLocal: ${await user.IsLocal()}`);
	console.log(`IsVRMode: ${await user.IsVRMode()}`);
	console.log(`IsMenuOpen: ${await user.IsMenuOpen()}`);
	console.log(`IsGrounded: ${await user.IsGrounded()}`);
	console.log(`IsFlying: ${await user.IsFlying()}`);
	console.log(`MoveSpeed: ${await user.GetMoveSpeed()}`);
	console.log(`JumpVelocity: ${await user.GetJumpVelocity()}`);
	console.log(`GravityStrength: ${await user.GetGravityStrength()}`);
};

export const userAPITestRegister = () => {
	Networking.OnUserJoined(printUser);
	Networking.OnUserLeft(printUser);
};

export const userTest = async (sceneGrpah: SceneGraph) => {
	const users = await User.GetUsers();
	await Promise.all(users.map((user) => printUser(user)));
};

export const userMoveUp = async (sceneGrpah: SceneGraph) => {
	const users = await User.GetUsers();
	await Promise.all(
		users.map(async (user) => {
			const currentSpeed = await user.GetMoveSpeed();
			await user.SetMoveSpeed(currentSpeed + 1);
		}),
	);
};

export const userMoveDown = async (sceneGrpah: SceneGraph) => {
	const users = await User.GetUsers();
	await Promise.all(
		users.map(async (user) => {
			const currentSpeed = await user.GetMoveSpeed();
			await user.SetMoveSpeed(currentSpeed - 1);
		}),
	);
};
