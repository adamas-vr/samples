import { vec3 } from "gl-matrix";
import {
	Entity,
	EntityManager,
	GrabInteractableManager,
	Material,
	Mesh,
	MeshManager,
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
const STROKE_SAMPLE_INTERVAL_MS = 1000 / 60;

type StrokeState = {
	entity: Entity;
	mesh: Mesh;
	points: vec3[];
	lastPoint?: vec3;
};

let penEntity: Entity;
let penTipEntity: Entity;
let strokeMaterial: Material;
let activeInteractor: Entity | null = null;
let activeStroke: StrokeState | null = null;
let nextStroke: StrokeState | null = null;
let nextStrokePromise: Promise<StrokeState> | null = null;
let isStrokeMeshUpdating = false;
let needsStrokeMeshRefresh = false;
let strokeSessionId = 0;

function cloneVec3(input: vec3): vec3 {
	return vec3.fromValues(input[0], input[1], input[2]);
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

	for (let i = 0; i < points.length - 1; i++) {
		const segment = vec3.subtract(vec3.create(), points[i + 1], points[i]);
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
	if (isStrokeMeshUpdating) {
		needsStrokeMeshRefresh = true;
		return;
	}

	isStrokeMeshUpdating = true;

	try {
		do {
			needsStrokeMeshRefresh = false;
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
		} while (needsStrokeMeshRefresh);
	} finally {
		isStrokeMeshUpdating = false;
	}
}

async function createStrokeEntity(): Promise<StrokeState> {
	const entity = await EntityManager.Create(`Stroke ${Date.now()}`);
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
		entity,
		mesh,
		points: [],
	};
}

async function prepareNextStroke() {
	if (nextStroke || nextStrokePromise) {
		return;
	}

	nextStrokePromise = createStrokeEntity();
	nextStroke = await nextStrokePromise;
	nextStrokePromise = null;
}

async function appendTipPoint(force = false, stroke = activeStroke) {
	if (!stroke) {
		return;
	}

	const tipWorldPosition =
		await TransformManager.GetWorldPosition(penTipEntity);
	const point = cloneVec3(tipWorldPosition);

	if (!force && activeStroke !== stroke) {
		return;
	}

	if (!force && !shouldAppendPoint(stroke.lastPoint, point)) {
		return;
	}

	if (stroke.points.length >= MAX_POINTS_PER_STROKE) {
		return;
	}

	stroke.points.push(point);
	stroke.lastPoint = point;
	await refreshStrokeMesh(stroke);
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
	activeStroke = null;
	activeInteractor = null;
	strokeSessionId++;

	if (!stroke) {
		return;
	}

	await appendTipPoint(true, stroke);
}

Project.FromBundle(projectBundle).Launch(async (sceneGraph, project) => {
	if (!sceneGraph?.["@Pen"]?.["@Pen Tip"]) {
		throw new Error("Pen scene graph nodes were not found.");
	}

	penEntity = sceneGraph["@Pen"].entityId;
	penTipEntity = sceneGraph["@Pen"]["@Pen Tip"].entityId;
	strokeMaterial = await RenderableManager.GetMaterial(penTipEntity, 0);
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

	project.ScheduleUpdate(() => {
		if (!activeStroke) {
			return;
		}

		void appendTipPoint(false);
	});
});
