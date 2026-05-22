import {
	CameraManager,
	ColliderManager,
	EntityManager,
	GrabInteractableManager,
	MaterialManager,
	MaterialProperty,
	Networking,
	Project,
	NewQuadMesh,
	RenderableManager,
	RigidbodyManager,
	TextureFormat,
	TextureManager,
	TransformManager,
	MovementType,
} from "@adamasvr/sdk";
import { quat, vec3 } from "gl-matrix";
import { projectBundle } from "adamasvr:editor";

Project.FromBundle(projectBundle).Launch(async (sceneGraph, project) => {
	if (sceneGraph === undefined) return;
	const display = sceneGraph["@Camera"]["@Preview"].entityId;
	const camera = sceneGraph["@Camera"]["@Film"].entityId;
	const button = sceneGraph["@Camera"].entityId;

	const renderTexture = await TextureManager.CreateRenderTexture(900, 1200);

	CameraManager.SetRenderTexture(camera, renderTexture);
	const previewMat = await RenderableManager.GetMaterial(display, 0);
	MaterialManager.SetTexture(
		previewMat,
		MaterialProperty.BaseColorMap,
		renderTexture,
	);

	const tex = await TextureManager.Create2D(1, 1, TextureFormat.RGBA32);
	const photoQuad = await NewQuadMesh();
	const isLocalMode = await Networking.IsLocalMode();

	type PreparedPhoto = {
		entity: number;
		texture: number;
	};

	const preparePhoto = async (): Promise<PreparedPhoto> => {
		const photo = await EntityManager.Create("Photo");
		EntityManager.SetActive(photo, false);

		const photoMat = await MaterialManager.Create();
		TransformManager.SetLocalScale(photo, vec3.fromValues(0.3, 0.4, 1));
		if (!isLocalMode) {
			await Networking.MakeNetworkTransform(photo);
		}

		await RenderableManager.Create(photo);
		RenderableManager.SetMesh(photo, photoQuad);
		RenderableManager.SetMaterial(photo, photoMat);
		RenderableManager.SetReceiveShadows(photo, false);
		const photoTexture = await TextureManager.Create2D(
			1,
			1,
			TextureFormat.RGBA32,
		);
		MaterialManager.SetTexture(
			photoMat,
			MaterialProperty.BaseColorMap,
			photoTexture,
		);
		MaterialManager.SetFloat(photoMat, MaterialProperty.Culling, 0);

		const collider = await ColliderManager.CreateBox(photo);
		ColliderManager.SetBoxColliderCenter(collider, vec3.fromValues(0, 0, 0));
		ColliderManager.SetBoxColliderSize(collider, vec3.fromValues(1, 1, 0.02));

		await RigidbodyManager.Create(photo);
		RigidbodyManager.SetIsKinematic(photo, true);
		RigidbodyManager.SetUseGravity(photo, false);

		await GrabInteractableManager.Create(photo);
		GrabInteractableManager.SetMovementType(photo, MovementType.Instantaneous);
		GrabInteractableManager.SetDynamicAttach(photo, true);
		GrabInteractableManager.SetAllowHoverActivate(photo, false);
		GrabInteractableManager.SetTrackPosition(photo, true);
		GrabInteractableManager.SetTrackRotation(photo, true);
		GrabInteractableManager.SetThrowOnDetach(photo, false);
		GrabInteractableManager.SetEnabled(photo, false);
		if (!isLocalMode) {
			await GrabInteractableManager.MakeNetworkGrabble(photo);
		}

		return {
			entity: photo,
			texture: photoTexture,
		};
	};

	const placePhoto = async (photo: PreparedPhoto) => {
		const cameraPosition = await TransformManager.GetWorldPosition(camera);
		const cameraRotation = await TransformManager.GetWorldRotation(camera);

		TransformManager.SetWorldPosition(photo.entity, vec3.clone(cameraPosition));
		TransformManager.SetWorldRotation(photo.entity, quat.clone(cameraRotation));
		EntityManager.SetActive(photo.entity, true);
		GrabInteractableManager.SetEnabled(photo.entity, true);
	};

	let nextPhotoPromise = preparePhoto();
	const capturePhoto = Networking.NewFunction(async () => {
		const result = await TextureManager.ReadbackJPGImage(renderTexture);
		const imageData = result.data;
		const photo = await nextPhotoPromise;

		nextPhotoPromise = preparePhoto();
		TextureManager.LoadImage(tex, imageData);
		TextureManager.LoadImage(photo.texture, imageData);
		await placePhoto(photo);
	});

	GrabInteractableManager.AddActivatedCallback(button, async () => {
		capturePhoto();
	});
});
