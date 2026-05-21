import { vec3 } from "gl-matrix";
import {
	Entity,
	EntityManager,
	GrabInteractableManager,
	Material,
	Mesh,
	MeshManager,
	Networking,
	NetworkState,
	Project,
	RenderableManager,
	ShadowCastingMode,
	TransformManager,
} from "@adamasvr/sdk";
import { projectBundle } from "adamasvr:editor";

const PEN_RADIUS = 0.005;
const PEN_SIDES = 8;
const MIN_POINT_DISTANCE = 0.005;
const MAX_POINTS_PER_STROKE = 4096;
const STROKE_CHANNEL = "spatial-pen-strokes";
const NETWORK_FLUSH_INTERVAL_MS = 1000 / 20;
const NETWORK_POINTS_PER_BATCH = 12;
const SNAPSHOT_POINTS_PER_BATCH = 48;

type StrokeState = {
	strokeId: string;
	entity: Entity;
	mesh: Mesh;
	points: vec3[];
	lastPoint?: vec3;
	isMeshUpdating: boolean;
	needsMeshRefresh: boolean;
};

type ActiveStrokeSyncState = {
	strokeId: string;
	ownerClientId: number;
};

type AppendStrokeMessage = {
	type: "append";
	strokeId: string;
	points: number[];
};

type EndStrokeMessage = {
	type: "end";
	strokeId: string;
};

type SnapshotStrokeMessage = {
	type: "snapshot";
	strokeId: string;
	points: number[];
	offset: number;
	replace: boolean;
	complete: boolean;
};

type StrokeNetworkMessage =
	| AppendStrokeMessage
	| EndStrokeMessage
	| SnapshotStrokeMessage;

let penEntity: Entity;
let penTipEntity: Entity;
let strokeMaterial: Material;
let localClientId = -1;
let isLocalMode = true;
let activeInteractor: Entity | null = null;
let activeStroke: StrokeState | null = null;
let nextStroke: StrokeState | null = null;
let nextStrokePromise: Promise<StrokeState> | null = null;
let strokeSessionId = 0;
let localStrokeSequence = 0;
let lastNetworkFlushTime = 0;
let activeStrokeState: NetworkState<ActiveStrokeSyncState | null>;
let requestStrokeReplay: ((requesterClientId: number) => void) | null = null;
const strokesById = new Map<string, StrokeState>();
const strokeCreationPromises = new Map<string, Promise<StrokeState>>();
const completedStrokeIds: string[] = [];
const pendingNetworkPointsByStrokeId = new Map<string, number[]>();

function cloneVec3(input: vec3): vec3 {
	return vec3.fromValues(input[0], input[1], input[2]);
}

function flattenPoints(points: vec3[]): number[] {
	const flattened: number[] = [];

	for (const point of points) {
		flattened.push(point[0], point[1], point[2]);
	}

	return flattened;
}

function shouldAppendPoint(
	lastPoint: vec3 | undefined,
	nextPoint: vec3,
): boolean {
	if (!lastPoint) {
		return true;
	}

	return vec3.distance(lastPoint, nextPoint) >= MIN_POINT_DISTANCE;
}

function getStableReferenceAxis(tangent: vec3): vec3 {
	const up = vec3.fromValues(0, 1, 0);
	if (Math.abs(vec3.dot(tangent, up)) < 0.95) {
		return up;
	}

	return vec3.fromValues(1, 0, 0);
}

function makeStrokeId() {
	localStrokeSequence += 1;
	return `${localClientId}:${localStrokeSequence}`;
}

function rememberCompletedStroke(strokeId: string) {
	if (!completedStrokeIds.includes(strokeId)) {
		completedStrokeIds.push(strokeId);
	}
}

function buildTubeMesh(points: vec3[], radius: number, sides: number) {
	if (points.length < 2) {
		return {
			vertices: new Float32Array(0),
			normals: new Float32Array(0),
			uvs: new Float32Array(0),
			indices: new Uint16Array(0),
		};
	}

	const vertices: number[] = [];
	const normals: number[] = [];
	const uvs: number[] = [];
	const indices: number[] = [];
	const ringCount = points.length;
	const tangents: vec3[] = [];
	let totalLength = 0;
	const cumulativeLengths = [0];

	for (let index = 0; index < points.length - 1; index++) {
		const segment = vec3.subtract(vec3.create(), points[index + 1], points[index]);
		const length = vec3.length(segment);
		if (length > 0) {
			vec3.scale(segment, segment, 1 / length);
		}
		tangents.push(segment);
		totalLength += length;
		cumulativeLengths.push(totalLength);
	}
	tangents.push(cloneVec3(tangents[tangents.length - 1]));

	for (let ringIndex = 0; ringIndex < ringCount; ringIndex++) {
		const center = points[ringIndex];
		const tangent = vec3.normalize(vec3.create(), tangents[ringIndex]);
		const referenceAxis = getStableReferenceAxis(tangent);
		const normal = vec3.normalize(
			vec3.create(),
			vec3.cross(vec3.create(), referenceAxis, tangent),
		);
		const binormal = vec3.normalize(
			vec3.create(),
			vec3.cross(vec3.create(), tangent, normal),
		);
		const v = totalLength > 0 ? cumulativeLengths[ringIndex] / totalLength : 0;

		for (let side = 0; side < sides; side++) {
			const angle = (side / sides) * Math.PI * 2;
			const radialOffset = vec3.create();
			vec3.scaleAndAdd(
				radialOffset,
				radialOffset,
				normal,
				Math.cos(angle) * radius,
			);
			vec3.scaleAndAdd(
				radialOffset,
				radialOffset,
				binormal,
				Math.sin(angle) * radius,
			);

			const vertex = vec3.add(vec3.create(), center, radialOffset);
			const radialNormal = vec3.normalize(vec3.create(), radialOffset);

			vertices.push(vertex[0], vertex[1], vertex[2]);
			normals.push(radialNormal[0], radialNormal[1], radialNormal[2]);
			uvs.push(side / sides, v);
		}
	}

	for (let ringIndex = 0; ringIndex < ringCount - 1; ringIndex++) {
		const ringStart = ringIndex * sides;
		const nextRingStart = (ringIndex + 1) * sides;

		for (let side = 0; side < sides; side++) {
			const nextSide = (side + 1) % sides;
			const current = ringStart + side;
			const currentNext = ringStart + nextSide;
			const next = nextRingStart + side;
			const nextNext = nextRingStart + nextSide;

			indices.push(current, next, currentNext);
			indices.push(currentNext, next, nextNext);
		}
	}

	return {
		vertices: new Float32Array(vertices),
		normals: new Float32Array(normals),
		uvs: new Float32Array(uvs),
		indices: new Uint16Array(indices),
	};
}

async function refreshStrokeMesh(stroke: StrokeState) {
	if (stroke.isMeshUpdating) {
		stroke.needsMeshRefresh = true;
		return;
	}

	stroke.isMeshUpdating = true;

	try {
		do {
			stroke.needsMeshRefresh = false;
			const { vertices, normals, uvs, indices } = buildTubeMesh(
				stroke.points,
				PEN_RADIUS,
				PEN_SIDES,
			);
			await Promise.all([
				MeshManager.SetVertices(stroke.mesh, vertices),
				MeshManager.SetNormals(stroke.mesh, normals),
				MeshManager.SetUVs(stroke.mesh, uvs),
				MeshManager.SetTriangles(stroke.mesh, indices),
			]);
			await MeshManager.RecalcBounds(stroke.mesh);
		} while (stroke.needsMeshRefresh);
	} finally {
		stroke.isMeshUpdating = false;
	}
}

async function createStrokeEntity(strokeId: string): Promise<StrokeState> {
	const entity = await EntityManager.Create(`Stroke ${strokeId}`);
	await TransformManager.SetWorldPosition(entity, vec3.fromValues(0, 0, 0));
	await TransformManager.SetWorldRotation(entity, [0, 0, 0, 1]);
	await TransformManager.SetLocalScale(entity, vec3.fromValues(1, 1, 1));
	await RenderableManager.Create(entity);

	const mesh = await MeshManager.Create();
	await RenderableManager.SetMesh(entity, mesh);
	await RenderableManager.SetMaterial(entity, strokeMaterial, 0);
	await RenderableManager.SetShadowMode(entity, ShadowCastingMode.On);
	await RenderableManager.SetReceiveShadows(entity, true);

	return {
		strokeId,
		entity,
		mesh,
		points: [],
		isMeshUpdating: false,
		needsMeshRefresh: false,
	};
}

async function getOrCreateStroke(strokeId: string) {
	const existingStroke = strokesById.get(strokeId);
	if (existingStroke) {
		return existingStroke;
	}

	const existingPromise = strokeCreationPromises.get(strokeId);
	if (existingPromise) {
		return existingPromise;
	}

	const creationPromise = createStrokeEntity(strokeId).then((stroke) => {
		strokesById.set(strokeId, stroke);
		strokeCreationPromises.delete(strokeId);
		return stroke;
	});

	strokeCreationPromises.set(strokeId, creationPromise);
	return creationPromise;
}

async function prepareNextStroke() {
	if (nextStroke || nextStrokePromise) {
		return;
	}

	nextStrokePromise = createStrokeEntity(makeStrokeId());
	nextStroke = await nextStrokePromise;
	strokesById.set(nextStroke.strokeId, nextStroke);
	nextStrokePromise = null;
}

async function appendPointToStroke(
	stroke: StrokeState,
	point: vec3,
	force = false,
	refreshMesh = true,
) {
	if (stroke.points.length >= MAX_POINTS_PER_STROKE) {
		return false;
	}

	if (!force && !shouldAppendPoint(stroke.lastPoint, point)) {
		return false;
	}

	stroke.points.push(point);
	stroke.lastPoint = point;

	if (refreshMesh) {
		await refreshStrokeMesh(stroke);
	}

	return true;
}

async function appendNetworkPoints(strokeId: string, flatPoints: number[]) {
	const stroke = await getOrCreateStroke(strokeId);
	let didAppend = false;

	for (let index = 0; index < flatPoints.length; index += 3) {
		const point = vec3.fromValues(
			flatPoints[index],
			flatPoints[index + 1],
			flatPoints[index + 2],
		);
		const appended = await appendPointToStroke(stroke, point, false, false);
		didAppend = didAppend || appended;
	}

	if (didAppend) {
		await refreshStrokeMesh(stroke);
	}
}

async function replaceStrokePoints(
	strokeId: string,
	flatPoints: number[],
	offset: number,
	complete: boolean,
) {
	const stroke = await getOrCreateStroke(strokeId);

	if (offset === 0) {
		stroke.points = [];
		stroke.lastPoint = undefined;
	}

	for (let index = 0; index < flatPoints.length; index += 3) {
		const point = vec3.fromValues(
			flatPoints[index],
			flatPoints[index + 1],
			flatPoints[index + 2],
		);
		stroke.points.push(point);
		stroke.lastPoint = point;
	}

	await refreshStrokeMesh(stroke);

	if (complete) {
		rememberCompletedStroke(strokeId);
	}
}

function queueNetworkPoint(strokeId: string, point: vec3) {
	if (isLocalMode) {
		return;
	}

	const pendingPoints = pendingNetworkPointsByStrokeId.get(strokeId) ?? [];
	pendingPoints.push(point[0], point[1], point[2]);
	pendingNetworkPointsByStrokeId.set(strokeId, pendingPoints);
}

function sendStrokeChannelMessage(message: StrokeNetworkMessage) {
	if (isLocalMode) {
		return;
	}

	Networking.BroadcastMessage(STROKE_CHANNEL, JSON.stringify(message));
}

function flushNetworkPoints(stroke: StrokeState | null, force = false) {
	if (!stroke || isLocalMode) {
		return;
	}

	const pendingPoints = pendingNetworkPointsByStrokeId.get(stroke.strokeId);
	if (!pendingPoints || pendingPoints.length === 0) {
		return;
	}

	const now = Date.now();
	const hasFullBatch = pendingPoints.length >= NETWORK_POINTS_PER_BATCH * 3;
	if (!force && !hasFullBatch && now - lastNetworkFlushTime < NETWORK_FLUSH_INTERVAL_MS) {
		return;
	}

	do {
		const points = pendingPoints.splice(0, NETWORK_POINTS_PER_BATCH * 3);
		sendStrokeChannelMessage({
			type: "append",
			strokeId: stroke.strokeId,
			points,
		});
		lastNetworkFlushTime = Date.now();
	} while (force && pendingPoints.length > 0);

	if (pendingPoints.length === 0) {
		pendingNetworkPointsByStrokeId.delete(stroke.strokeId);
	}
}

async function appendTipPoint(force = false, stroke = activeStroke) {
	if (!stroke) {
		return false;
	}

	if (!force && activeStroke !== stroke) {
		return false;
	}

	const tipWorldPosition = await TransformManager.GetWorldPosition(penTipEntity);
	const point = cloneVec3(tipWorldPosition);
	const didAppend = await appendPointToStroke(stroke, point, force, true);

	if (didAppend) {
		queueNetworkPoint(stroke.strokeId, point);
	}

	return didAppend;
}

async function handleStrokeChannelMessage(
	senderClientId: number,
	payload: string,
) {
	if (senderClientId === localClientId) {
		return;
	}

	const message = JSON.parse(payload) as StrokeNetworkMessage;

	if (message.type === "append") {
		await appendNetworkPoints(message.strokeId, message.points);
		return;
	}

	if (message.type === "snapshot") {
		await replaceStrokePoints(
			message.strokeId,
			message.points,
			message.offset,
			message.complete,
		);
		return;
	}

	if (message.type === "end") {
		rememberCompletedStroke(message.strokeId);
	}
}

function sendStrokeSnapshotToClient(
	targetClientId: number,
	stroke: StrokeState,
	complete: boolean,
) {
	if (isLocalMode) {
		return;
	}

	const flatPoints = flattenPoints(stroke.points);
	for (
		let offset = 0;
		offset < flatPoints.length;
		offset += SNAPSHOT_POINTS_PER_BATCH * 3
	) {
		const message: SnapshotStrokeMessage = {
			type: "snapshot",
			strokeId: stroke.strokeId,
			points: flatPoints.slice(offset, offset + SNAPSHOT_POINTS_PER_BATCH * 3),
			offset,
			replace: offset === 0,
			complete,
		};
		Networking.SendMessageTo(
			targetClientId,
			STROKE_CHANNEL,
			JSON.stringify(message),
		);
	}
}

async function handleActiveStrokeStateChange(
	state: ActiveStrokeSyncState | null,
) {
	if (!state || state.ownerClientId === localClientId) {
		return;
	}

	await getOrCreateStroke(state.strokeId);
}

async function beginStroke(interactorEntity: Entity) {
	if (activeInteractor !== null || activeStroke || !nextStroke) {
		return;
	}

	const sessionId = ++strokeSessionId;
	const stroke = nextStroke;
	nextStroke = null;
	activeInteractor = interactorEntity;
	activeStroke = stroke;
	void prepareNextStroke();

	if (strokeSessionId !== sessionId || activeInteractor !== interactorEntity) {
		return;
	}

	await appendTipPoint(true, stroke);
	activeStrokeState.value = {
		strokeId: stroke.strokeId,
		ownerClientId: localClientId,
	};
	flushNetworkPoints(stroke, true);
}

async function endStroke(interactorEntity?: Entity) {
	if (
		interactorEntity !== undefined &&
		activeInteractor !== null &&
		activeInteractor !== interactorEntity
	) {
		return;
	}

	const stroke = activeStroke;
	strokeSessionId++;

	if (!stroke) {
		activeInteractor = null;
		activeStrokeState.value = null;
		return;
	}

	await appendTipPoint(true, stroke);
	flushNetworkPoints(stroke, true);
	sendStrokeChannelMessage({
		type: "end",
		strokeId: stroke.strokeId,
	});
	rememberCompletedStroke(stroke.strokeId);
	activeStroke = null;
	activeInteractor = null;
	activeStrokeState.value = null;
}

Project.FromBundle(projectBundle).Launch(async (sceneGraph, project) => {
	if (!sceneGraph?.["@Pen"]?.["@Pen Tip"]) {
		throw new Error("Pen scene graph nodes were not found.");
	}

	penEntity = sceneGraph["@Pen"].entityId;
	penTipEntity = sceneGraph["@Pen"]["@Pen Tip"].entityId;
	strokeMaterial = await RenderableManager.GetMaterial(penTipEntity, 0);
	localClientId = await Networking.GetClientId();
	isLocalMode = await Networking.IsLocalMode();

	Networking.NewChannel(STROKE_CHANNEL, (senderClientId, payload) => {
		void handleStrokeChannelMessage(senderClientId, payload);
	});

	activeStrokeState = Networking.NewVariable<ActiveStrokeSyncState | null>(
		null,
		(state) => {
			void handleActiveStrokeStateChange(state);
		},
	);
	requestStrokeReplay = Networking.NewFunction(
		async (requesterClientId: number) => {
			if (requesterClientId === localClientId) {
				return;
			}

			const masterClientId = await Networking.GetMasterClientId();
			if (masterClientId !== localClientId) {
				return;
			}

			for (const strokeId of completedStrokeIds) {
				const stroke = strokesById.get(strokeId);
				if (stroke) {
					sendStrokeSnapshotToClient(requesterClientId, stroke, true);
				}
			}

			if (activeStroke) {
				sendStrokeSnapshotToClient(requesterClientId, activeStroke, false);
			}
		},
	);

	await prepareNextStroke();

	await GrabInteractableManager.AddActivatedCallback(
		penEntity,
		(_, interactorEntity) => {
			void beginStroke(interactorEntity);
		},
	);
	await GrabInteractableManager.AddDeactivatedCallback(
		penEntity,
		(_, interactorEntity) => {
			void endStroke(interactorEntity);
		},
	);
	await GrabInteractableManager.AddSelectExitedCallback(
		penEntity,
		(_, interactorEntity) => {
			void endStroke(interactorEntity);
		},
	);

	if (!isLocalMode) {
		requestStrokeReplay?.(localClientId);
	}

	project.ScheduleUpdate(() => {
		if (!activeStroke) {
			return;
		}

		void appendTipPoint(false, activeStroke);
		flushNetworkPoints(activeStroke, false);
	});
});
