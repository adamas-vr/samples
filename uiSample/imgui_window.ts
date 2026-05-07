import { EntityManager, TransformManager } from "@adamasvr/sdk";
import { vec3 } from "gl-matrix";
import * as ImGui from "imgui-adamas";
import * as ImGui_Impl from "./imgui_impl_adamas_node";

export async function CreateImGuiWindow({
	ui,
	uiInit,
}: {
	ui: (imgui: typeof ImGui, timestep: number) => void;
	uiInit?: (imgui: typeof ImGui) => void | Promise<void>;
}) {
	await ImGui.default();
	ImGui.CHECKVERSION();
	ImGui.CreateContext();

	const uiEntity = await EntityManager.Create("ImGui Host");
	await TransformManager.SetLocalScale(uiEntity, vec3.fromValues(0.64, 0.36, 1));
	await TransformManager.SetLocalPosition(uiEntity, vec3.fromValues(0, 1.0, 0));

	ImGui.GetIO().Fonts.AddFontDefault();
	ImGui.StyleColorsDark();
	ImGui_Impl.Init({ targetEntity: uiEntity, displayWidth: 1280, displayHeight: 720 });

	await uiInit?.(ImGui);

	let lastFrameTime = Date.now();
	return setInterval(() => {
		const now = Date.now();
		const timestep = now - lastFrameTime;
		lastFrameTime = now;

		ImGui_Impl.NewFrame(timestep);
		ImGui.NewFrame();

		ImGui.SetNextWindowPos(new ImGui.Vec2(0, 0), ImGui.Cond.Always, new ImGui.Vec2(0, 0));
		ImGui.SetNextWindowSize(new ImGui.Vec2(1280, 720), ImGui.Cond.Always);

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
