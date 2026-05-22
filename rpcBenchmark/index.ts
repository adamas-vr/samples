import {
	EntityManager,
	NewQuadMesh,
	Project,
	RenderableManager,
	ShadowCastingMode,
	TextureFormat,
	TextureManager,
	TransformManager,
	type Entity,
	User,
} from "@adamasvr/sdk";
import { projectBundle } from "adamasvr:editor";
import { vec3 } from "gl-matrix";
import { CreateImGuiWindow } from "imgui-adamas";

const UI_WIDTH = 960;
const UI_HEIGHT = 1280;
const PANEL_WORLD_WIDTH = 1.1;
const LOG_CAPACITY = 160;
const PLOT_HEIGHT = 120;

type LatencySample = {
	callCount: number;
	allAtOnceMs: number;
	sequentialMs: number;
};

type ThroughputSample = {
	textureSize: number;
	completionCount: number;
	elapsedMs: number;
};

type SingleCallSample = {
	textureSize: number;
	timeMs: number;
};

type BenchmarkMode = "all" | "latency" | "throughput";

type BenchmarkSettings = {
	latencyMinCalls: number;
	latencyMaxCalls: number;
	latencyStep: number;
	throughputMinTextureSize: number;
	throughputMaxTextureSize: number;
	throughputTextureStep: number;
	throughputDurationMs: number;
};

const benchmarkState: {
	settings: BenchmarkSettings;
	running: boolean;
	hasAutoRunCompleted: boolean;
	status: string;
	logs: string[];
	latencySamples: LatencySample[];
	throughputSamples: ThroughputSample[];
	singleCallSamples: SingleCallSample[];
	panelEntity: Entity | null;
	benchmarkEntity: Entity | null;
} = {
	settings: {
		latencyMinCalls: 10,
		latencyMaxCalls: 150,
		latencyStep: 10,
		throughputMinTextureSize: 64,
		throughputMaxTextureSize: 4096,
		throughputTextureStep: 64,
		throughputDurationMs: 1000,
	},
	running: false,
	hasAutoRunCompleted: false,
	status: "Idle",
	logs: [],
	latencySamples: [],
	throughputSamples: [],
	singleCallSamples: [],
	panelEntity: null,
	benchmarkEntity: null,
};

const throughputPayloads = new Map<number, Uint8Array>();

function clampInt(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeSettings(): void {
	const settings = benchmarkState.settings;
	settings.latencyMinCalls = clampInt(settings.latencyMinCalls, 1, 150);
	settings.latencyMaxCalls = clampInt(settings.latencyMaxCalls, 1, 150);
	settings.latencyStep = clampInt(settings.latencyStep, 1, 1000);
	if (settings.latencyMaxCalls < settings.latencyMinCalls) {
		settings.latencyMaxCalls = settings.latencyMinCalls;
	}

	settings.throughputMinTextureSize = clampInt(
		settings.throughputMinTextureSize,
		4,
		2048,
	);
	settings.throughputMaxTextureSize = clampInt(
		settings.throughputMaxTextureSize,
		4,
		4096,
	);
	settings.throughputTextureStep = clampInt(
		settings.throughputTextureStep,
		1,
		512,
	);
	settings.throughputDurationMs = clampInt(
		settings.throughputDurationMs,
		250,
		10_000,
	);
	if (settings.throughputMaxTextureSize < settings.throughputMinTextureSize) {
		settings.throughputMaxTextureSize = settings.throughputMinTextureSize;
	}
}

function pushLog(message: string): void {
	const timestamp = new Date().toLocaleTimeString("en-US", {
		hour12: false,
	});
	benchmarkState.logs.unshift(`[${timestamp}] ${message}`);
	if (benchmarkState.logs.length > LOG_CAPACITY) {
		benchmarkState.logs.length = LOG_CAPACITY;
	}
}

function setStatus(message: string): void {
	benchmarkState.status = message;
	pushLog(message);
}

function buildSeries(start: number, end: number, step: number): number[] {
	const values: number[] = [];
	for (let value = start; value <= end; value += step) {
		values.push(value);
	}
	if (values.length === 0 || values[values.length - 1] !== end) {
		values.push(end);
	}
	return values;
}

function formatMs(value: number): string {
	return `${value.toFixed(2)} ms`;
}

function formatRate(value: number): string {
	return `${value.toFixed(2)} calls/s`;
}

function getLatencyPosition(index: number): vec3 {
	const x = (index % 32) * 0.0025;
	const y = Math.floor(index / 32) * 0.0025;
	return vec3.fromValues(x, y, 0);
}

function getTexturePayload(size: number): Uint8Array {
	const cached = throughputPayloads.get(size);
	if (cached !== undefined) {
		return cached;
	}

	const rgba = new Uint8Array(size * size * 4);
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const index = (y * size + x) * 4;
			rgba[index + 0] = (x * 13 + y * 3) % 256;
			rgba[index + 1] = (x * 5 + y * 11) % 256;
			rgba[index + 2] = (x * 7 + y * 17) % 256;
			rgba[index + 3] = 255;
		}
	}

	throughputPayloads.set(size, rgba);
	return rgba;
}

async function createPanelEntity(): Promise<Entity> {
	const localUser = await User.GetLocalUser();
	const headEntity = await localUser.GetHeadEntity();
	const entity = await EntityManager.Create("RPC Benchmark Panel");

	await TransformManager.SetLocalPosition(entity, vec3.fromValues(0, 1, -1.2));
	await TransformManager.SetLocalScale(
		entity,
		vec3.fromValues(
			PANEL_WORLD_WIDTH,
			(PANEL_WORLD_WIDTH * UI_HEIGHT) / UI_WIDTH,
			1,
		),
	);
	await RenderableManager.Create(entity);
	await RenderableManager.SetMesh(entity, await NewQuadMesh());
	await RenderableManager.SetReceiveShadows(entity, false);
	await RenderableManager.SetShadowMode(entity, ShadowCastingMode.Off);

	return entity;
}

async function createBenchmarkEntity(): Promise<Entity> {
	const entity = await EntityManager.Create("RPC Benchmark Target");
	await TransformManager.SetWorldPosition(entity, vec3.fromValues(0, -5, 0));
	await TransformManager.SetLocalScale(entity, vec3.fromValues(1, 1, 1));
	return entity;
}

async function runLatencyBenchmark(entity: Entity): Promise<void> {
	const settings = benchmarkState.settings;
	const callCounts = buildSeries(
		settings.latencyMinCalls,
		settings.latencyMaxCalls,
		settings.latencyStep,
	);

	benchmarkState.latencySamples = [];
	setStatus(
		`Running latency benchmark across ${callCounts.length} control points`,
	);

	for (const callCount of callCounts) {
		const allAtOnceStart = performance.now();
		const allAtOnceCalls: Promise<void>[] = [];
		for (let index = 0; index < callCount; index++) {
			allAtOnceCalls.push(
				TransformManager.SetLocalPosition(entity, getLatencyPosition(index)),
			);
		}
		await Promise.all(allAtOnceCalls);
		const allAtOnceMs = performance.now() - allAtOnceStart;

		const sequentialStart = performance.now();
		for (let index = 0; index < callCount; index++) {
			await TransformManager.SetLocalPosition(
				entity,
				getLatencyPosition(index),
			);
		}
		const sequentialMs = performance.now() - sequentialStart;

		benchmarkState.latencySamples.push({
			callCount,
			allAtOnceMs,
			sequentialMs,
		});
		pushLog(
			`Latency X=${callCount}: burst=${formatMs(allAtOnceMs)}, ` +
				`sequential=${formatMs(sequentialMs)}`,
		);
	}
}

async function runThroughputBenchmark(): Promise<void> {
	const settings = benchmarkState.settings;
	const textureSizes = buildSeries(
		settings.throughputMinTextureSize,
		settings.throughputMaxTextureSize,
		settings.throughputTextureStep,
	);

	benchmarkState.throughputSamples = [];
	setStatus(
		`Running throughput benchmark across ${textureSizes.length} texture sizes`,
	);

	for (const textureSize of textureSizes) {
		const texture = await TextureManager.Create2D(
			textureSize,
			textureSize,
			TextureFormat.RGBA32,
			true,
		);
		const rgba = getTexturePayload(textureSize);
		let completionCount = 0;
		const startedAt = performance.now();
		const deadline = startedAt + settings.throughputDurationMs;

		try {
			while (performance.now() < deadline) {
				await TextureManager.LoadRGBAImage(
					texture,
					rgba,
					textureSize,
					textureSize,
				);
				completionCount++;
			}
		} finally {
			await TextureManager.Destroy(texture).catch((error) => {
				console.error("Failed to destroy throughput benchmark texture", error);
			});
		}

		const elapsedMs = performance.now() - startedAt;
		benchmarkState.throughputSamples.push({
			textureSize,
			completionCount,
			elapsedMs,
		});
		pushLog(
			`Throughput ${textureSize}x${textureSize}: ` +
				`${completionCount} uploads in ${(elapsedMs / 1000).toFixed(2)} s ` +
				`(${formatRate((completionCount * 1000) / elapsedMs)})`,
		);
	}
}

async function runSingleCallBenchmark(): Promise<void> {
	const settings = benchmarkState.settings;
	const textureSizes = buildSeries(
		settings.throughputMinTextureSize,
		settings.throughputMaxTextureSize,
		settings.throughputTextureStep,
	);

	benchmarkState.singleCallSamples = [];
	setStatus(
		`Running single texture upload timing across ${textureSizes.length} texture sizes`,
	);

	for (const textureSize of textureSizes) {
		const texture = await TextureManager.Create2D(
			textureSize,
			textureSize,
			TextureFormat.RGBA32,
			true,
		);
		const rgba = getTexturePayload(textureSize);

		try {
			const startMs = performance.now();
			await TextureManager.LoadRGBAImage(
				texture,
				rgba,
				textureSize,
				textureSize,
			);
			const timeMs = performance.now() - startMs;

			benchmarkState.singleCallSamples.push({
				textureSize,
				timeMs,
			});
			pushLog(
				`Single upload ${textureSize}x${textureSize}: ${formatMs(timeMs)}`,
			);
		} finally {
			await TextureManager.Destroy(texture).catch((error) => {
				console.error("Failed to destroy single-call benchmark texture", error);
			});
		}
	}
}

async function runBenchmarks(mode: BenchmarkMode): Promise<void> {
	if (benchmarkState.running || benchmarkState.benchmarkEntity === null) {
		return;
	}

	normalizeSettings();
	benchmarkState.running = true;
	setStatus(`Preparing ${mode} benchmark run`);

	try {
		if (mode === "all" || mode === "latency") {
			await runLatencyBenchmark(benchmarkState.benchmarkEntity);
		}
		if (mode === "all" || mode === "throughput") {
			await runThroughputBenchmark();
			await runSingleCallBenchmark();
		}
		setStatus(`Completed ${mode} benchmark run`);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown benchmark failure";
		setStatus(`Benchmark failed: ${message}`);
		console.error(error);
	} finally {
		benchmarkState.running = false;
	}
}

function maybeStartInitialBenchmarkRun(): void {
	if (benchmarkState.hasAutoRunCompleted || benchmarkState.running) {
		return;
	}

	benchmarkState.hasAutoRunCompleted = true;
	pushLog("Starting initial automatic benchmark run");
	void runBenchmarks("all");
}

function renderControls(ImGui: typeof import("imgui-adamas/imgui")): void {
	ImGui.Text("Adamas SDK Internal RPC Benchmark");
	ImGui.Separator();
	ImGui.Text(
		`Panel ${UI_WIDTH}x${UI_HEIGHT} on a scaled quad. ` +
			`Status: ${benchmarkState.status}`,
	);

	if (!benchmarkState.running) {
		if (ImGui.Button("Run All Benchmarks")) {
			void runBenchmarks("all");
		}
		if (ImGui.Button("Run Latency Only")) {
			void runBenchmarks("latency");
		}
		if (ImGui.Button("Run Throughput Only")) {
			void runBenchmarks("throughput");
		}
	} else {
		ImGui.TextWrapped("Benchmark run in progress. Controls are read-only.");
	}

	ImGui.Separator();
	ImGui.Text("Latency control parameters");

	const latencyMinCalls: [number] = [benchmarkState.settings.latencyMinCalls];
	ImGui.SetNextItemWidth(260);
	if (
		ImGui.InputInt("Latency min calls", latencyMinCalls, 1, 10) &&
		!benchmarkState.running
	) {
		benchmarkState.settings.latencyMinCalls = latencyMinCalls[0];
		normalizeSettings();
	}

	const latencyMaxCalls: [number] = [benchmarkState.settings.latencyMaxCalls];
	ImGui.SetNextItemWidth(260);
	if (
		ImGui.InputInt("Latency max calls", latencyMaxCalls, 1, 50) &&
		!benchmarkState.running
	) {
		benchmarkState.settings.latencyMaxCalls = latencyMaxCalls[0];
		normalizeSettings();
	}

	const latencyStep: [number] = [benchmarkState.settings.latencyStep];
	ImGui.SetNextItemWidth(260);
	if (
		ImGui.InputInt("Latency step", latencyStep, 1, 10) &&
		!benchmarkState.running
	) {
		benchmarkState.settings.latencyStep = latencyStep[0];
		normalizeSettings();
	}

	ImGui.Separator();
	ImGui.Text("Throughput control parameters");

	const throughputMinTextureSize: [number] = [
		benchmarkState.settings.throughputMinTextureSize,
	];
	ImGui.SetNextItemWidth(260);
	if (
		ImGui.InputInt(
			"Throughput min texture size",
			throughputMinTextureSize,
			1,
			16,
		) &&
		!benchmarkState.running
	) {
		benchmarkState.settings.throughputMinTextureSize =
			throughputMinTextureSize[0];
		normalizeSettings();
	}

	const throughputMaxTextureSize: [number] = [
		benchmarkState.settings.throughputMaxTextureSize,
	];
	ImGui.SetNextItemWidth(260);
	if (
		ImGui.InputInt(
			"Throughput max texture size",
			throughputMaxTextureSize,
			1,
			64,
		) &&
		!benchmarkState.running
	) {
		benchmarkState.settings.throughputMaxTextureSize =
			throughputMaxTextureSize[0];
		normalizeSettings();
	}

	const throughputTextureStep: [number] = [
		benchmarkState.settings.throughputTextureStep,
	];
	ImGui.SetNextItemWidth(260);
	if (
		ImGui.InputInt("Throughput texture step", throughputTextureStep, 1, 16) &&
		!benchmarkState.running
	) {
		benchmarkState.settings.throughputTextureStep = throughputTextureStep[0];
		normalizeSettings();
	}

	const throughputDurationMs: [number] = [
		benchmarkState.settings.throughputDurationMs,
	];
	ImGui.SetNextItemWidth(260);
	if (
		ImGui.InputInt("Throughput duration (ms)", throughputDurationMs, 50, 250) &&
		!benchmarkState.running
	) {
		benchmarkState.settings.throughputDurationMs = throughputDurationMs[0];
		normalizeSettings();
	}
}

function renderLatencyPlot(
	ImGui: typeof import("imgui-adamas/imgui"),
	graphWidth: number,
): void {
	const samples = benchmarkState.latencySamples;
	const burstValues = samples.map((sample) => sample.allAtOnceMs);
	const sequentialValues = samples.map((sample) => sample.sequentialMs);
	const burstMaxMs = Math.max(1, ...burstValues);
	const sequentialMaxMs = Math.max(1, ...sequentialValues);

	ImGui.Text("RPC latency");
	if (samples.length === 0) {
		ImGui.TextWrapped(
			"Run the latency benchmark to populate the burst and sequential curves.",
		);
		return;
	}

	const latest = samples[samples.length - 1];
	ImGui.PlotLines(
		"All-at-once latency",
		burstValues,
		burstValues.length,
		0,
		`${latest.callCount} calls: ${formatMs(latest.allAtOnceMs)}`,
		0,
		burstMaxMs,
		new ImGui.Vec2(graphWidth, PLOT_HEIGHT),
	);
	ImGui.PlotLines(
		"Sequential latency",
		sequentialValues,
		sequentialValues.length,
		0,
		`${latest.callCount} calls: ${formatMs(latest.sequentialMs)}`,
		0,
		sequentialMaxMs,
		new ImGui.Vec2(graphWidth, PLOT_HEIGHT),
	);

	if (ImGui.CollapsingHeader("Latency trial data")) {
		if (
			ImGui.BeginTable(
				"latency-results",
				3,
				ImGui.TableFlags.Borders |
					ImGui.TableFlags.RowBg |
					ImGui.TableFlags.SizingStretchSame,
				new ImGui.Vec2(0, 0),
			)
		) {
			ImGui.TableSetupColumn("X: Calls");
			ImGui.TableSetupColumn("Burst ms");
			ImGui.TableSetupColumn("Sequential ms");
			ImGui.TableHeadersRow();

			for (const sample of samples) {
				ImGui.TableNextRow();
				ImGui.TableSetColumnIndex(0);
				ImGui.Text(`${sample.callCount}`);
				ImGui.TableSetColumnIndex(1);
				ImGui.Text(sample.allAtOnceMs.toFixed(2));
				ImGui.TableSetColumnIndex(2);
				ImGui.Text(sample.sequentialMs.toFixed(2));
			}

			ImGui.EndTable();
		}
	}
}

function renderThroughputPlot(
	ImGui: typeof import("imgui-adamas/imgui"),
	graphWidth: number,
): void {
	const samples = benchmarkState.throughputSamples;
	const values = samples.map((sample) => sample.completionCount);
	const maxCount = Math.max(1, ...values);

	ImGui.Text("RPC throughput");
	if (samples.length === 0) {
		ImGui.TextWrapped(
			"Run the throughput benchmark to populate the texture upload completion curve.",
		);
		return;
	}

	const latest = samples[samples.length - 1];
	ImGui.PlotLines(
		"Texture upload completions",
		values,
		values.length,
		0,
		`${latest.textureSize}px: ${latest.completionCount} calls`,
		0,
		maxCount,
		new ImGui.Vec2(graphWidth, PLOT_HEIGHT),
	);

	if (ImGui.CollapsingHeader("Throughput trial data")) {
		if (
			ImGui.BeginTable(
				"throughput-results",
				4,
				ImGui.TableFlags.Borders |
					ImGui.TableFlags.RowBg |
					ImGui.TableFlags.SizingStretchSame,
				new ImGui.Vec2(0, 0),
			)
		) {
			ImGui.TableSetupColumn("X: Texture");
			ImGui.TableSetupColumn("Calls");
			ImGui.TableSetupColumn("Elapsed ms");
			ImGui.TableSetupColumn("Calls/s");
			ImGui.TableHeadersRow();

			for (const sample of samples) {
				ImGui.TableNextRow();
				ImGui.TableSetColumnIndex(0);
				ImGui.Text(`${sample.textureSize}x${sample.textureSize}`);
				ImGui.TableSetColumnIndex(1);
				ImGui.Text(`${sample.completionCount}`);
				ImGui.TableSetColumnIndex(2);
				ImGui.Text(sample.elapsedMs.toFixed(2));
				ImGui.TableSetColumnIndex(3);
				ImGui.Text(
					((sample.completionCount * 1000) / sample.elapsedMs).toFixed(2),
				);
			}

			ImGui.EndTable();
		}
	}
}

function renderSingleCallPlot(
	ImGui: typeof import("imgui-adamas/imgui"),
	graphWidth: number,
): void {
	const samples = benchmarkState.singleCallSamples;
	const values = samples.map((sample) => sample.timeMs);
	const maxMs = Math.max(1, ...values);

	ImGui.Text("Single texture upload cost");
	if (samples.length === 0) {
		ImGui.TextWrapped(
			"Run the throughput benchmark to populate the single upload timing curve.",
		);
		return;
	}

	const latest = samples[samples.length - 1];
	ImGui.PlotLines(
		"Single LoadRGBAImage call",
		values,
		values.length,
		0,
		`${latest.textureSize}px: ${formatMs(latest.timeMs)}`,
		0,
		maxMs,
		new ImGui.Vec2(graphWidth, PLOT_HEIGHT),
	);

	if (ImGui.CollapsingHeader("Single upload trial data")) {
		if (
			ImGui.BeginTable(
				"single-upload-results",
				2,
				ImGui.TableFlags.Borders |
					ImGui.TableFlags.RowBg |
					ImGui.TableFlags.SizingStretchSame,
				new ImGui.Vec2(0, 0),
			)
		) {
			ImGui.TableSetupColumn("X: Texture");
			ImGui.TableSetupColumn("Single call ms");
			ImGui.TableHeadersRow();

			for (const sample of samples) {
				ImGui.TableNextRow();
				ImGui.TableSetColumnIndex(0);
				ImGui.Text(`${sample.textureSize}x${sample.textureSize}`);
				ImGui.TableSetColumnIndex(1);
				ImGui.Text(sample.timeMs.toFixed(2));
			}

			ImGui.EndTable();
		}
	}
}

function renderLogs(ImGui: typeof import("imgui-adamas/imgui")): void {
	ImGui.Text("Benchmark logs");
	if (
		ImGui.BeginChild(
			"benchmark-logs",
			new ImGui.Vec2(0, 180),
			true,
			ImGui.WindowFlags.HorizontalScrollbar,
		)
	) {
		if (benchmarkState.logs.length === 0) {
			ImGui.TextWrapped("No logs yet.");
		} else {
			for (const logLine of benchmarkState.logs) {
				ImGui.TextWrapped(logLine);
			}
		}
	}
	ImGui.EndChild();
}

Project.FromBundle(projectBundle).Launch(async (_, project) => {
	benchmarkState.panelEntity = await createPanelEntity();
	benchmarkState.benchmarkEntity = await createBenchmarkEntity();
	pushLog(
		`Created benchmark panel entity ${benchmarkState.panelEntity} ` +
			`and benchmark target entity ${benchmarkState.benchmarkEntity}`,
	);

	if (!benchmarkState.hasAutoRunCompleted) {
		benchmarkState.hasAutoRunCompleted = true;
		pushLog("Starting initial automatic benchmark run");
		await runBenchmarks("all");
	}

	await CreateImGuiWindow(
		project,
		{
			targetEntity: benchmarkState.panelEntity,
			displayWidth: UI_WIDTH,
			displayHeight: UI_HEIGHT,
			styleColor: "dark",
			clearColor: [0.05, 0.06, 0.08, 0.96],
			fontSizePx: 16,
		},
		(ImGui) => {
			// maybeStartInitialBenchmarkRun();
			renderControls(ImGui);
			ImGui.Separator();
			renderLatencyPlot(ImGui, 420);
			ImGui.Separator();
			renderThroughputPlot(ImGui, 420);
			ImGui.Separator();
			renderSingleCallPlot(ImGui, 420);
			ImGui.Separator();
			renderLogs(ImGui);
		},
	);
});
