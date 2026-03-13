import { createHash } from "node:crypto";
import {
	mkdir,
	readdir,
	readFile,
	rename,
	stat,
	unlink,
	writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { ErrorCodes, ExcalidrawMcpError, type FileStat } from "@core/types";

function getErrorCode(error: unknown): string | undefined {
	if (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		typeof error.code === "string"
	) {
		return error.code;
	}
	return undefined;
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}

/**
 * Validates that a target path is strictly inside the allowed Vault root.
 * Prevents directory traversal attacks (e.g. `../../../etc/passwd`).
 */
export function validateVaultPath(
	vaultRoot: string,
	targetPath: string,
): string {
	const absoluteRoot = resolve(vaultRoot);
	const absoluteTarget = resolve(vaultRoot, targetPath);

	if (!absoluteTarget.startsWith(absoluteRoot)) {
		throw new ExcalidrawMcpError(
			ErrorCodes.E_STORAGE_PATH_OUTSIDE_VAULT,
			`Operation rejected: Target path is outside the allowed Vault root (${absoluteTarget})`,
		);
	}

	return absoluteTarget;
}

/**
 * Gets the file statistics (mtime, size, sha256) for conflict detection.
 */
export async function getFileStat(filePath: string): Promise<FileStat> {
	try {
		const fileStat = await stat(filePath);
		const buffer = await readFile(filePath);
		const hash = createHash("sha256").update(buffer).digest("hex");

		return {
			mtimeMs: fileStat.mtimeMs,
			size: fileStat.size,
			sha256: hash,
		};
	} catch (error: unknown) {
		if (getErrorCode(error) === "ENOENT") {
			throw new ExcalidrawMcpError(
				ErrorCodes.E_NOT_FOUND_NOTE,
				`File not found: ${filePath}`,
			);
		}
		throw error;
	}
}

/**
 * Reads a file and its FileStat.
 */
export async function readVaultFile(
	vaultRoot: string,
	relativePath: string,
): Promise<{ content: string; fileStat: FileStat }> {
	const filePath = validateVaultPath(vaultRoot, relativePath);
	const fileStat = await getFileStat(filePath);
	const content = await readFile(filePath, "utf-8");

	return { content, fileStat };
}

/**
 * Writes a file atomically using a temporary file and rename.
 * Checks for conflicts before overriding.
 */
export async function writeVaultFileAtomically(
	vaultRoot: string,
	relativePath: string,
	content: string,
	originalStat?: FileStat,
): Promise<FileStat> {
	const absolutePath = validateVaultPath(vaultRoot, relativePath);

	// 1. Conflict detection if originalStat is provided
	if (originalStat) {
		try {
			const currentStat = await getFileStat(absolutePath);

			// If the file changed on disk, abort
			if (
				currentStat.mtimeMs > originalStat.mtimeMs ||
				currentStat.size !== originalStat.size ||
				currentStat.sha256 !== originalStat.sha256
			) {
				throw new ExcalidrawMcpError(
					ErrorCodes.E_CONFLICT_MODIFIED,
					`File modified externally since it was read: ${relativePath}`,
				);
			}
		} catch (error: unknown) {
			// If it's not found now but we had an original stat, it was deleted
			if (getErrorCode(error) === ErrorCodes.E_NOT_FOUND_NOTE) {
				throw new ExcalidrawMcpError(
					ErrorCodes.E_CONFLICT_MODIFIED,
					`File was deleted externally since it was read: ${relativePath}`,
				);
			}
			throw error;
		}
	}

	// 2. Write Atomically
	const dir = dirname(absolutePath);
	await mkdir(dir, { recursive: true });

	const tmpPath = `${absolutePath}.tmp.${Date.now()}`;

	try {
		await writeFile(tmpPath, content, "utf-8");
		// Ensure data is synced to disk (fsync is not exposed cleanly in fs/promises without opening a handle,
		// but Node.js rename operation is POSIX atomic on most filesystems)
		await rename(tmpPath, absolutePath);
	} catch (error: unknown) {
		try {
			// Cleanup tmp file on failure
			await unlink(tmpPath);
		} catch (_cleanupError) {
			// Ignore cleanup error
		}
		throw new ExcalidrawMcpError(
			ErrorCodes.E_STORAGE_WRITE_FAILED,
			`Failed to write file securely: ${getErrorMessage(error)}`,
		);
	}

	// 3. Return the new stat
	return getFileStat(absolutePath);
}

// ─── Snapshots ───────────────────────────────────────────────

const SNAPSHOT_DIR_NAME = ".ai-excalidraw-snapshots";

export async function createSnapshot(
	vaultRoot: string,
	relativePath: string,
): Promise<string> {
	const sourcePath = validateVaultPath(vaultRoot, relativePath);
	const snapshotRoot = join(vaultRoot, SNAPSHOT_DIR_NAME);

	await mkdir(snapshotRoot, { recursive: true });

	const originalFileName = basename(relativePath);
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const snapshotFileName = `${originalFileName}_${timestamp}.snapshot.md`;

	const snapshotPath = join(snapshotRoot, snapshotFileName);

	const content = await readFile(sourcePath, "utf-8");
	await writeFile(snapshotPath, content, "utf-8");

	return snapshotFileName;
}

export async function listSnapshots(
	vaultRoot: string,
	originalFileName?: string,
): Promise<string[]> {
	const snapshotRoot = join(vaultRoot, SNAPSHOT_DIR_NAME);

	try {
		const files = await readdir(snapshotRoot);
		if (!originalFileName) return files;

		return files.filter((f) => f.startsWith(originalFileName));
	} catch (error: unknown) {
		if (getErrorCode(error) === "ENOENT") return [];
		throw error;
	}
}

export async function restoreSnapshot(
	vaultRoot: string,
	relativePath: string,
	snapshotFileName: string,
): Promise<void> {
	const _targetPath = validateVaultPath(vaultRoot, relativePath);
	const snapshotRoot = join(vaultRoot, SNAPSHOT_DIR_NAME);
	const snapshotPath = join(snapshotRoot, snapshotFileName);

	try {
		const content = await readFile(snapshotPath, "utf-8");
		// Write atomically, ignoring conflicts since a restore is meant to force-overwrite
		await writeVaultFileAtomically(vaultRoot, relativePath, content);
	} catch (error: unknown) {
		if (getErrorCode(error) === "ENOENT") {
			throw new ExcalidrawMcpError(
				ErrorCodes.E_NOT_FOUND_NOTE,
				`Snapshot not found: ${snapshotPath}`,
			);
		}
		throw error;
	}
}

/**
 * Lists markdown files in the vault for link suggestions.
 * Returns file paths without .md extension for easy WikiLink creation.
 */
export async function listVaultMarkdownFiles(
	vaultRoot: string,
): Promise<string[]> {
	const markdownFiles: string[] = [];

	async function walkDir(dir: string, relativePath: string = "") {
		try {
			const entries = await readdir(dir, { withFileTypes: true });

			for (const entry of entries) {
				// Skip hidden directories and the snapshot directory
				if (
					entry.name.startsWith(".") ||
					entry.name === "node_modules" ||
					entry.name === ".ai-excalidraw-snapshots"
				) {
					continue;
				}

				const entryPath = join(dir, entry.name);
				const entryRelativePath = join(relativePath, entry.name);

				if (entry.isDirectory()) {
					await walkDir(entryPath, entryRelativePath);
				} else if (entry.isFile() && entry.name.endsWith(".md")) {
					// Remove .md extension and add to list
					const withoutExt = entryRelativePath.slice(0, -3);
					markdownFiles.push(withoutExt);
				}
			}
		} catch (error: unknown) {
			// Skip directories we can't read
			if (getErrorCode(error) !== "EACCES") {
				throw error;
			}
		}
	}

	await walkDir(vaultRoot);
	return markdownFiles;
}
