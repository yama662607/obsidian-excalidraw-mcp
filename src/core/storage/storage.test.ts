import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ErrorCodes, ExcalidrawMcpError } from "@core/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createSnapshot,
	getFileStat,
	listSnapshots,
	readVaultFile,
	restoreSnapshot,
	validateVaultPath,
	writeVaultFileAtomically,
} from "./storage";

const TEST_VAULT = join(__dirname, "../../../test-vault");

describe("Safe Storage Layer", () => {
	beforeEach(async () => {
		await mkdir(TEST_VAULT, { recursive: true });
		await writeFile(join(TEST_VAULT, "test.md"), "test content", "utf-8");
	});

	afterEach(async () => {
		await rm(TEST_VAULT, { recursive: true, force: true });
	});

	describe("validateVaultPath", () => {
		it("should allow paths inside vault", () => {
			const p = validateVaultPath(TEST_VAULT, "test.md");
			expect(p).toBe(join(TEST_VAULT, "test.md"));
		});

		it("should allow nested paths inside vault", () => {
			const p = validateVaultPath(TEST_VAULT, "folder/test.md");
			expect(p).toBe(join(TEST_VAULT, "folder/test.md"));
		});

		it("should reject directory traversal attacks", () => {
			expect(() => validateVaultPath(TEST_VAULT, "../outside.md")).toThrowError(
				ExcalidrawMcpError,
			);
			expect(() =>
				validateVaultPath(TEST_VAULT, "../../etc/passwd"),
			).toThrowError(ExcalidrawMcpError);

			try {
				validateVaultPath(TEST_VAULT, "../outside.md");
			} catch (error: unknown) {
				expect(error).toBeInstanceOf(ExcalidrawMcpError);
				if (error instanceof ExcalidrawMcpError) {
					expect(error.code).toBe(ErrorCodes.E_STORAGE_PATH_OUTSIDE_VAULT);
				}
			}
		});
	});

	describe("getFileStat", () => {
		it("should return mtime, size and sha256", async () => {
			const stats = await getFileStat(join(TEST_VAULT, "test.md"));
			expect(stats.mtimeMs).toBeGreaterThan(0);
			expect(stats.size).toBeGreaterThan(0);
			expect(stats.sha256.length).toBe(64);
		});

		it("should throw E_NOT_FOUND_NOTE for missing files", async () => {
			await expect(
				getFileStat(join(TEST_VAULT, "missing.md")),
			).rejects.toThrowError(ExcalidrawMcpError);
		});
	});

	describe("readVaultFile", () => {
		it("should return context and stat", async () => {
			const { content, fileStat } = await readVaultFile(TEST_VAULT, "test.md");
			expect(content).toBe("test content");
			expect(fileStat.size).toBe(12);
		});
	});

	describe("writeVaultFileAtomically", () => {
		it("should write file successfully", async () => {
			const newStat = await writeVaultFileAtomically(
				TEST_VAULT,
				"new.md",
				"new content",
			);
			expect(newStat.size).toBe(11);

			const content = await readVaultFile(TEST_VAULT, "new.md");
			expect(content.content).toBe("new content");
		});

		it("should create missing directories", async () => {
			await writeVaultFileAtomically(
				TEST_VAULT,
				"deep/nested/file.md",
				"nested",
			);
			const { content } = await readVaultFile(
				TEST_VAULT,
				"deep/nested/file.md",
			);
			expect(content).toBe("nested");
		});

		it("should succeed if originalStat matches current file state", async () => {
			const { fileStat } = await readVaultFile(TEST_VAULT, "test.md");
			const newStat = await writeVaultFileAtomically(
				TEST_VAULT,
				"test.md",
				"updated content",
				fileStat,
			);
			expect(newStat.mtimeMs).toBeGreaterThanOrEqual(fileStat.mtimeMs);
		});

		it("should fail with E_CONFLICT_MODIFIED if file was changed externally", async () => {
			const { fileStat } = await readVaultFile(TEST_VAULT, "test.md");

			// Simulate external mod
			await writeFile(join(TEST_VAULT, "test.md"), "external", "utf-8");

			// Attempt write with old stat
			await expect(
				writeVaultFileAtomically(TEST_VAULT, "test.md", "my content", fileStat),
			).rejects.toThrowError(ExcalidrawMcpError);

			try {
				await writeVaultFileAtomically(
					TEST_VAULT,
					"test.md",
					"my content",
					fileStat,
				);
			} catch (error: unknown) {
				expect(error).toBeInstanceOf(ExcalidrawMcpError);
				if (error instanceof ExcalidrawMcpError) {
					expect(error.code).toBe(ErrorCodes.E_CONFLICT_MODIFIED);
				}
			}
		});

		it("should fail with E_CONFLICT_MODIFIED if file was deleted externally but expected to exist", async () => {
			const { fileStat } = await readVaultFile(TEST_VAULT, "test.md");

			await rm(join(TEST_VAULT, "test.md"));

			await expect(
				writeVaultFileAtomically(TEST_VAULT, "test.md", "my content", fileStat),
			).rejects.toThrowError(ExcalidrawMcpError);
		});
	});

	describe("Snapshots", () => {
		it("should create, list and restore snapshots", async () => {
			// Create snapshot
			const snapshotFile = await createSnapshot(TEST_VAULT, "test.md");
			expect(snapshotFile).toContain("test.md_");

			// Modify original
			await writeVaultFileAtomically(TEST_VAULT, "test.md", "changed content");
			const { content: changed } = await readVaultFile(TEST_VAULT, "test.md");
			expect(changed).toBe("changed content");

			// List mock vault
			const snaps = await listSnapshots(TEST_VAULT, "test.md");
			expect(snaps.length).toBe(1);

			// Restore
			await restoreSnapshot(TEST_VAULT, "test.md", snapshotFile);
			const { content: restored } = await readVaultFile(TEST_VAULT, "test.md");
			expect(restored).toBe("test content");
		});
	});
});
