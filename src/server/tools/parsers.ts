import { parseToDocument, rebuildMarkdown } from "@core/parser/parser";
import {
	createSnapshot,
	listSnapshots,
	readVaultFile,
	restoreSnapshot,
	writeVaultFileAtomically,
} from "@core/storage/storage";
import { ExcalidrawMcpError } from "@core/types";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "../config";

/**
 * Handle ExcalidrawMcpError and other errors consistently for MCP tools.
 */
export function withErrorHandling<T>(fn: () => Promise<T>): Promise<T> {
	return fn().catch((error: unknown) => {
		if (error instanceof ExcalidrawMcpError) {
			throw new Error(`[${error.code}] ${error.message}`);
		}
		if (error instanceof Error) {
			throw new Error(`Internal Error: ${error.message}`);
		}
		throw new Error(`Internal Error: ${String(error)}`);
	});
}

export function getVaultPathOrThrow(): string {
	const vaultPath = config.vaultPath;
	if (!vaultPath) {
		throw new Error(
			"FATAL: OBSIDIAN_VAULT_PATH environment variable or --vault argument is required.",
		);
	}
	return vaultPath;
}

/**
 * Common Zod schema for tools that require a file path.
 */
export const FilePathSchema = z.object({
	filePath: z
		.string()
		.describe("Relative path to the .excalidraw.md file inside the Vault"),
});

export function registerParsers(server: McpServer) {
	server.tool(
		"inspect_drawing",
		"Reads and parses an .excalidraw.md document into a structured JSON representation.",
		FilePathSchema.shape,
		async ({ filePath }) => {
			return withErrorHandling(async () => {
				const vaultPath = getVaultPathOrThrow();
				const { content, fileStat } = await readVaultFile(vaultPath, filePath);
				const doc = parseToDocument(content, filePath, fileStat);

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(doc, null, 2),
						},
					],
				};
			});
		},
	);

	// Snapshot Management Tools
	server.tool(
		"snapshot_drawing",
		"Manages snapshots of Excalidraw drawings. Supports create, list, and restore operations.",
		{
			...FilePathSchema.shape,
			action: z
				.enum(["create", "list", "restore"])
				.describe("Action to perform: create, list, or restore"),
			snapshotFileName: z
				.string()
				.optional()
				.describe("Required for restore: name of the snapshot file to restore"),
		},
		async (params) => {
			return withErrorHandling(async () => {
				const vaultPath = getVaultPathOrThrow();

				switch (params.action) {
					case "create": {
						const snapshotFileName = await createSnapshot(
							vaultPath,
							params.filePath,
						);
						return {
							content: [
								{
									type: "text",
									text: `Snapshot created: ${snapshotFileName}`,
								},
							],
						};
					}

					case "list": {
						// Extract the file name from the path for filtering
						const fileName =
							params.filePath.split("/").pop() || params.filePath;
						const snapshots = await listSnapshots(vaultPath, fileName);

						if (snapshots.length === 0) {
							return {
								content: [
									{
										type: "text",
										text: "No snapshots found for this drawing.",
									},
								],
							};
						}

						return {
							content: [
								{
									type: "text",
									text: JSON.stringify({ snapshots }, null, 2),
								},
							],
						};
					}

					case "restore": {
						if (!params.snapshotFileName) {
							throw new Error(
								"snapshotFileName parameter is required for restore action",
							);
						}
						await restoreSnapshot(
							vaultPath,
							params.filePath,
							params.snapshotFileName,
						);
						return {
							content: [
								{
									type: "text",
									text: `Drawing restored from snapshot: ${params.snapshotFileName}`,
								},
							],
						};
					}

					default:
						return {
							content: [{ type: "text", text: "Unknown action" }],
						};
				}
			});
		},
	);

	// Convert Drawing Format Tool
	server.tool(
		"convert_drawing_format",
		"Converts between .excalidraw.md and .excalidraw JSON formats.",
		{
			...FilePathSchema.shape,
			direction: z
				.enum(["to-json", "to-markdown"])
				.describe("Conversion direction: to-json or to-markdown"),
			outputPath: z
				.string()
				.describe(
					"Output file path (relative to vault) for the converted file",
				),
		},
		async (params) => {
			return withErrorHandling(async () => {
				const vaultPath = getVaultPathOrThrow();

				switch (params.direction) {
					case "to-json": {
						// Read .excalidraw.md and extract JSON
						const { content, fileStat } = await readVaultFile(
							vaultPath,
							params.filePath,
						);
						const doc = parseToDocument(content, params.filePath, fileStat);

						// Write as .excalidraw JSON file
						const jsonContent = JSON.stringify(doc.drawing, null, 2);
						await writeVaultFileAtomically(
							vaultPath,
							params.outputPath,
							jsonContent,
						);

						return {
							content: [
								{
									type: "text",
									text: `Converted ${params.filePath} to JSON format: ${params.outputPath}`,
								},
							],
						};
					}

					case "to-markdown": {
						// Read JSON file and create .excalidraw.md
						const { content } = await readVaultFile(vaultPath, params.filePath);

						try {
							const scene = JSON.parse(content);

							// Create a minimal document structure
							const doc = {
								path: params.outputPath,
								frontmatter: null,
								rawFrontmatterText: null,
								headerNoticeText: null,
								textElements: {},
								elementLinks: {},
								embeddedFiles: null,
								drawing: scene,
								drawingEncoding: "json" as const,
								originalText: content,
								fileStat: { mtimeMs: 0, size: 0, sha256: "" },
							};

							const markdown = rebuildMarkdown(doc);
							await writeVaultFileAtomically(
								vaultPath,
								params.outputPath,
								markdown,
							);

							return {
								content: [
									{
										type: "text",
										text: `Converted ${params.filePath} to Excalidraw Markdown format: ${params.outputPath}`,
									},
								],
							};
						} catch (error: unknown) {
							throw new ExcalidrawMcpError(
								"E_PARSE_INVALID_MD",
								`Failed to parse JSON file: ${error instanceof Error ? error.message : String(error)}`,
							);
						}
					}

					default:
						return {
							content: [{ type: "text", text: "Unknown direction" }],
						};
				}
			});
		},
	);
}
