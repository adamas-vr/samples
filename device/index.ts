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
import { quat, vec2, vec3, vec4 } from "gl-matrix";

const ACTIVE_COLOR = vec4.fromValues(1, 0, 0, 1);
const BUTTON_ACTIVE_THRESHOLD = 0.5;
const THUMBSTICK_MAX_ANGLE_DEGREES = 18;
const LEFT_BUMPER_MAX_X_OFFSET = -0.003;
const RIGHT_BUMPER_MAX_X_OFFSET = 0.003;
const TRIGGER_MAX_X_DEGREES = -15;

type ButtonVisualizer = {
	entity: Entity;
	defaultColor: vec4;
	material: number;
};

type BumperMotion = {
	entity: Entity;
	basePosition: vec3;
	maxXOffset: number;
};

type TriggerMotion = {
	entity: Entity;
	baseRotation: quat;
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

const rotateThumbstick = async (
	entity: Entity,
	axis: vec2,
	flipXAxis: boolean,
): Promise<void> => {
	const absoluteRotation = quat.create();
	quat.fromEuler(
		absoluteRotation,
		-axis[1] * THUMBSTICK_MAX_ANGLE_DEGREES,
		(flipXAxis ? -axis[0] : axis[0]) * THUMBSTICK_MAX_ANGLE_DEGREES,
		0,
	);
	await TransformManager.SetLocalRotation(entity, absoluteRotation);
};

const setBumperGrip = async (
	bumper: BumperMotion,
	value: number,
): Promise<void> => {
	const nextPosition = vec3.clone(bumper.basePosition);
	nextPosition[0] += bumper.maxXOffset * value;
	await TransformManager.SetLocalPosition(bumper.entity, nextPosition);
};

const setTriggerPull = async (
	trigger: TriggerMotion,
	value: number,
): Promise<void> => {
	const pullRotation = quat.create();
	quat.fromEuler(pullRotation, TRIGGER_MAX_X_DEGREES * value, 0, 0);

	const nextRotation = quat.create();
	quat.multiply(nextRotation, trigger.baseRotation, pullRotation);
	await TransformManager.SetLocalRotation(trigger.entity, nextRotation);
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
		const leftBumperEntity = sceneGraph["@Left_Controller"]["@Bumper"].entityId;
		const rightBumperEntity =
			sceneGraph["@Right_Controller"]["@Bumper001"].entityId;
		const leftTriggerEntity =
			sceneGraph["@Left_Controller"]["@Trigger"].entityId;
		const rightTriggerEntity =
			sceneGraph["@Right_Controller"]["@Trigger001"].entityId;

		const [
			leftBumperBasePosition,
			rightBumperBasePosition,
			leftTriggerBaseRotation,
			rightTriggerBaseRotation,
		] = await Promise.all([
			TransformManager.GetLocalPosition(leftBumperEntity),
			TransformManager.GetLocalPosition(rightBumperEntity),
			TransformManager.GetLocalRotation(leftTriggerEntity),
			TransformManager.GetLocalRotation(rightTriggerEntity),
		]);

		const bumperMap = new Map<string, BumperMotion>([
			[
				DevicePath.LEFT_GRIP,
				{
					entity: leftBumperEntity,
					basePosition: leftBumperBasePosition,
					maxXOffset: LEFT_BUMPER_MAX_X_OFFSET,
				},
			],
			[
				DevicePath.RIGHT_GRIP,
				{
					entity: rightBumperEntity,
					basePosition: rightBumperBasePosition,
					maxXOffset: RIGHT_BUMPER_MAX_X_OFFSET,
				},
			],
		]);

		const triggerMap = new Map<string, TriggerMotion>([
			[
				DevicePath.LEFT_TRIGGER,
				{
					entity: leftTriggerEntity,
					baseRotation: leftTriggerBaseRotation,
				},
			],
			[
				DevicePath.RIGHT_TRIGGER,
				{
					entity: rightTriggerEntity,
					baseRotation: rightTriggerBaseRotation,
				},
			],
		]);

		const buttonMap = new Map<string, ButtonVisualizer>([
			[DevicePath.LEFT_GRIP, await loadButtonVisualizer(leftBumperEntity)],
			[DevicePath.LEFT_TRIGGER, await loadButtonVisualizer(leftTriggerEntity)],
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
			[DevicePath.RIGHT_GRIP, await loadButtonVisualizer(rightBumperEntity)],
			[
				DevicePath.RIGHT_TRIGGER,
				await loadButtonVisualizer(rightTriggerEntity),
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
			const bumper = bumperMap.get(devicePath);
			const trigger = triggerMap.get(devicePath);

			await Promise.all([
				button
					? setButtonActive(button, value >= BUTTON_ACTIVE_THRESHOLD)
					: Promise.resolve(),
				bumper ? setBumperGrip(bumper, value) : Promise.resolve(),
				trigger ? setTriggerPull(trigger, value) : Promise.resolve(),
			]);
		};

		const updateThumbstick = async (devicePath: string, value: vec2) => {
			if (devicePath === DevicePath.LEFT_PRIMARY_2D_AXIS) {
				await rotateThumbstick(leftStickEntity, value, true);
				return;
			}

			if (devicePath === DevicePath.RIGHT_PRIMARY_2D_AXIS) {
				await rotateThumbstick(rightStickEntity, value, false);
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
