import { readFile } from "node:fs/promises";
import * as ImGui from "imgui-adamas";
import * as ImGui_Impl from "./imgui_impl_adamas_node";

const DEFAULT_FONT_SIZE_PX = 24;
const DEFAULT_DISPLAY_WIDTH = 1280;
const DEFAULT_DISPLAY_HEIGHT = 720;

export async function CreateImGuiWindow({
	ui,
	initOptions,
}: {
	ui: (imgui: typeof ImGui, timestep: number) => void;
	initOptions: ImGui_Impl.AdamasInitOptions;
}) {
	await ImGui.default();
	ImGui.CHECKVERSION();
	ImGui.CreateContext();

	const io = ImGui.GetIO();
	const robotoFont = await readFile("Roboto-VariableFont_wdth,wght.ttf");
	io.FontDefault = io.Fonts.AddFontFromMemoryTTF(
		Uint8Array.from(robotoFont).buffer,
		DEFAULT_FONT_SIZE_PX,
		null,
		io.Fonts.GetGlyphRangesDefault(),
	);
	ImGui.StyleColorsDark();

	if (initOptions.displayHeight == undefined) {
		initOptions.displayHeight = DEFAULT_DISPLAY_HEIGHT;
	}
	if (initOptions.displayWidth == undefined) {
		initOptions.displayWidth = DEFAULT_DISPLAY_WIDTH;
	}

	ImGui_Impl.Init(initOptions);

	let lastFrameTime = Date.now();
	return setInterval(() => {
		const now = Date.now();
		const timestep = now - lastFrameTime;
		lastFrameTime = now;

		ImGui_Impl.NewFrame(timestep);
		ImGui.NewFrame();

		ImGui.SetNextWindowPos(
			new ImGui.Vec2(0, 0),
			ImGui.Cond.Always,
			new ImGui.Vec2(0, 0),
		);
		ImGui.SetNextWindowSize(
			new ImGui.Vec2(initOptions.displayWidth, initOptions.displayHeight),
			ImGui.Cond.Always,
		);

		ImGui.Begin(
			"UI",
			null,
			ImGui.WindowFlags.NoTitleBar |
				ImGui.WindowFlags.NoResize |
				ImGui.WindowFlags.NoMove |
				ImGui.WindowFlags.NoCollapse |
				ImGui.WindowFlags.NoNav |
				ImGui.WindowFlags.NoSavedSettings |
				ImGui.WindowFlags.NoBringToFrontOnFocus,
		);
		ui(ImGui, timestep);
		ImGui.End();

		ImGui_Impl.RenderDrawData();
	}, 1000 / 30);
}
