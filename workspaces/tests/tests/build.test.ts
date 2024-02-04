import { cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FuseV1Options, FuseVersion, flipFuses } from "@electron/fuses";
import { expect, test } from "@playwright/test";
import { execa } from "execa";
import retry from "p-retry";
import { launchElectron } from "./launchElectron.js";

const templateFolder = new URL("../../template", import.meta.url);
const packagePath = new URL("../../remix-electron", import.meta.url);

test("packaged build", async () => {
	test.setTimeout(1000 * 60 * 5);

	await using tempFolder = useTempFolder("remix-electron-template");
	console.info("[test:build] Temp folder path:", tempFolder.path);

	await cp(templateFolder, tempFolder.path, {
		recursive: true,
		filter: (source) =>
			!source.includes("node_modules") &&
			!source.includes("dist") &&
			!source.includes("build") &&
			!source.includes("public/dist") &&
			!source.includes(".cache"),
	});
	console.info(
		`[test:build] Copied from ${templateFolder} to ${tempFolder.path}`,
	);

	const commands = [
		["pnpm", "install", `${packagePath}`],
		["pnpm", "run", "build", "--dir"],
	] as const;

	for (const [command, ...args] of commands) {
		console.info(`[test:build] Running command: ${command} ${args.join(" ")}`);
		await execa(command, args, {
			cwd: tempFolder.path,
			stderr: "inherit",
		});
	}

	const executablePath = fileURLToPath(getExecutablePath(tempFolder.path));

	flipFuses(executablePath, {
		version: FuseVersion.V1,
		[FuseV1Options.EnableNodeCliInspectArguments]: true,
	});

	await using window = await launchElectron({
		executablePath: executablePath,
	});
	console.info("[test:build] Launched Electron window ✅");

	await expect(window.locator("h1")).toHaveText("Welcome to Remix");
});

function useTempFolder(prefix: string) {
	const tmpUrl = pathToFileURL(tmpdir());
	const path = new URL(`${prefix}-${Date.now()}`, `${tmpUrl}/`);
	return {
		path,
		async [Symbol.asyncDispose]() {
			await retry(() => rm(path, { recursive: true, force: true }));
		},
	};
}

function getExecutablePath(folder: URL) {
	if (process.platform === "win32") {
		return new URL(
			"./dist/win-unpacked/remix-electron-template.exe",
			`${folder}/`,
		);
	}
	if (process.platform === "darwin") {
		return new URL(
			"./dist/mac/remix-electron-template.app/Contents/MacOS/remix-electron-template",
			`${folder}/`,
		);
	}
	return new URL("./dist/linux-unpacked/remix-electron-template", `${folder}/`);
}
