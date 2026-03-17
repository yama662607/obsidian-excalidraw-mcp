import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function getPackageJsonPath(): string {
	const currentDir = dirname(fileURLToPath(import.meta.url));
	return join(currentDir, "../../package.json");
}

/**
 * Resolve package version from the installed package.json.
 * Falls back to "0.0.0" when the file cannot be read.
 */
export function resolveServerVersion(): string {
	try {
		const packageJson = JSON.parse(
			readFileSync(getPackageJsonPath(), "utf-8"),
		) as {
			version?: unknown;
		};
		if (typeof packageJson.version === "string") {
			return packageJson.version;
		}
	} catch {
		// Fallback keeps server startup resilient in unusual runtime layouts.
	}

	return "0.0.0";
}
