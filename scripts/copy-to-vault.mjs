import { copyFileSync, existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, "..");

const vaultPluginDir = "C:\\Users\\lx\\Documents\\sandbox\\.obsidian\\plugins\\lx-copilot";
const filesToCopy = ["main.js", "manifest.json", "styles.css"];

// 确保目标目录存在
if (!existsSync(vaultPluginDir)) {
	mkdirSync(vaultPluginDir, { recursive: true });
	console.log(`[copy] Created directory: ${vaultPluginDir}`);
}

for (const file of filesToCopy) {
	const src = join(root, file);
	const dest = join(vaultPluginDir, file);

	if (!existsSync(src)) {
		console.error(`[copy] Missing file: ${src}`);
		process.exit(1);
	}

	copyFileSync(src, dest);
	console.log(`[copy] ${file} -> ${dest}`);
}

console.log("[copy] Done. Refresh Obsidian (Ctrl+R) to see changes.");
