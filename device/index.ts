import {
	Device,
	DevicePath,
	Entity,
	MaterialManager,
	MaterialProperty,
	Project,
	RenderableManager,
	TransformManager,
	User,
} from "@adamasvr/sdk";
import { projectBundle } from "adamasvr:editor";
import { quat, vec2, vec4 } from "gl-matrix";

const ACTIVE_COLOR = vec4.fromValues(1, 0, 0, 1);
const BUTTON_ACTIVE_THRESHOLD = 0.5;
const THUMBSTICK_MAX_ANGLE_DEGREES = 18;

type ButtonVisualizer = {
	entity: Entity;
	defaultColor: vec4;
	material: number;
};

const loadButtonVisualizer = async (
	entity: Entity,
): Promise<ButtonVisualizer> => {
	const material = await RenderableManager.GetMaterial(entity);
	const defaultColor = await MaterialManager.GetColor(
		material,
		MaterialProperty.BaseColor,
	);

	return {
		entity,
		defaultColor,
		material,
	};
};

const setButtonActive = async (
	button: ButtonVisualizer,
	isActive: boolean,
): Promise<void> => {
	await MaterialManager.SetColor(
		button.material,
		MaterialProperty.BaseColor,
		isActive ? ACTIVE_COLOR : button.defaultColor,
	);
};

const rotateThumbstick = async (entity: Entity, axis: vec2): Promise<void> => {
	const absoluteRotation = quat.create();
	quat.fromEuler(
		absoluteRotation,
		axis[1] * THUMBSTICK_MAX_ANGLE_DEGREES,
		axis[0] * THUMBSTICK_MAX_ANGLE_DEGREES,
		0,
	);
	await TransformManager.SetLocalRotation(entity, absoluteRotation);
};

Project.FromBundle(projectBundle).Launch({
	OnSetup: async (project, sceneGraph) => {
		const localUser = await User.GetLocalUser();
		const [leftHandEntity, rightHandEntity] = await Promise.all([
			localUser.GetLeftHandEntity(),
			localUser.GetRightHandEntity(),
		]);
		const leftControllerEntity = sceneGraph["@Left_Controller"].entityId;
		const rightControllerEntity = sceneGraph["@Right_Controller"].entityId;

		await Promise.all([
			TransformManager.SetParent(leftControllerEntity, leftHandEntity),
			TransformManager.SetParent(rightControllerEntity, rightHandEntity),
		]);

		const leftStickEntity =
			sceneGraph["@Left_Controller"]["@XRController_Thumbstick_Buttons"][
				"@ThumbStick"
			].entityId;
		const rightStickEntity =
			sceneGraph["@Right_Controller"]["@XRController_Thumbstick_Buttons001"][
				"@ThumbStick001"
			].entityId;

		const buttonMap = new Map<string, ButtonVisualizer>([
			[
				DevicePath.LEFT_GRIP,
				await loadButtonVisualizer(
					sceneGraph["@Left_Controller"]["@Bumper"].entityId,
				),
			],
			[
				DevicePath.LEFT_TRIGGER,
				await loadButtonVisualizer(
					sceneGraph["@Left_Controller"]["@Trigger"].entityId,
				),
			],
			[
				DevicePath.LEFT_PRIMARY_2D_AXIS_BUTTON,
				await loadButtonVisualizer(leftStickEntity),
			],
			[
				DevicePath.LEFT_PRIMARY_BUTTON,
				await loadButtonVisualizer(
					sceneGraph["@Left_Controller"]["@XRController_Thumbstick_Buttons"][
						"@Button_A"
					].entityId,
				),
			],
			[
				DevicePath.LEFT_SECONDARY_BUTTON,
				await loadButtonVisualizer(
					sceneGraph["@Left_Controller"]["@XRController_Thumbstick_Buttons"][
						"@Button_B"
					].entityId,
				),
			],
			[
				DevicePath.RIGHT_GRIP,
				await loadButtonVisualizer(
					sceneGraph["@Right_Controller"]["@Bumper001"].entityId,
				),
			],
			[
				DevicePath.RIGHT_TRIGGER,
				await loadButtonVisualizer(
					sceneGraph["@Right_Controller"]["@Trigger001"].entityId,
				),
			],
			[
				DevicePath.RIGHT_PRIMARY_2D_AXIS_BUTTON,
				await loadButtonVisualizer(rightStickEntity),
			],
			[
				DevicePath.RIGHT_PRIMARY_BUTTON,
				await loadButtonVisualizer(
					sceneGraph["@Right_Controller"][
						"@XRController_Thumbstick_Buttons001"
					]["@Button_A001"].entityId,
				),
			],
			[
				DevicePath.RIGHT_SECONDARY_BUTTON,
				await loadButtonVisualizer(
					sceneGraph["@Right_Controller"][
						"@XRController_Thumbstick_Buttons001"
					]["@Button_B001"].entityId,
				),
			],
		]);

		const updateScalarInput = async (devicePath: string, value: number) => {
			const button = buttonMap.get(devicePath);
			if (!button) return;

			await setButtonActive(button, value >= BUTTON_ACTIVE_THRESHOLD);
		};

		const updateThumbstick = async (devicePath: string, value: vec2) => {
			if (devicePath === DevicePath.LEFT_PRIMARY_2D_AXIS) {
				await rotateThumbstick(leftStickEntity, value);
				return;
			}

			if (devicePath === DevicePath.RIGHT_PRIMARY_2D_AXIS) {
				await rotateThumbstick(rightStickEntity, value);
			}
		};

		const subscriptions = [
			DevicePath.LEFT_GRIP,
			DevicePath.LEFT_TRIGGER,
			DevicePath.LEFT_PRIMARY_2D_AXIS,
			DevicePath.LEFT_PRIMARY_2D_AXIS_BUTTON,
			DevicePath.LEFT_PRIMARY_BUTTON,
			DevicePath.LEFT_SECONDARY_BUTTON,
			DevicePath.RIGHT_GRIP,
			DevicePath.RIGHT_TRIGGER,
			DevicePath.RIGHT_PRIMARY_2D_AXIS,
			DevicePath.RIGHT_PRIMARY_2D_AXIS_BUTTON,
			DevicePath.RIGHT_PRIMARY_BUTTON,
			DevicePath.RIGHT_SECONDARY_BUTTON,
		];

		await Promise.all(
			subscriptions.map(async (devicePath) => {
				const currentValue = await Device.GetValue(devicePath);
				if (typeof currentValue === "number") {
					await updateScalarInput(devicePath, currentValue);
				} else if (currentValue !== undefined) {
					await updateThumbstick(devicePath, currentValue);
				}

				await Device.SubscribeValueChange(devicePath, (value) => {
					if (typeof value === "number") {
						void updateScalarInput(devicePath, value);
						return;
					}

					void updateThumbstick(devicePath, value);
				});
			}),
		);
	},
	OnTick: (project, timestep) => {},
});
