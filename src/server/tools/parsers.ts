import { randomUUID } from "node:crypto";
import { parseToDocument, rebuildMarkdown } from "@core/parser/parser";
import {
	createSnapshot,
	listSnapshots,
	readVaultFile,
	restoreSnapshot,
	writeVaultFileAtomically,
} from "@core/storage/storage";
import type { ErrorCode, ExcalidrawMdDocument } from "@core/types";
import { ErrorCodes, ExcalidrawMcpError } from "@core/types";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "../config";

/**
 * Handle ExcalidrawMcpError and other errors consistently for MCP tools.
 */
export function withErrorHandling<T>(fn: () => Promise<T>): Promise<
	| T
	| {
			isError: true;
			content: Array<{ type: "text"; text: string }>;
	  }
> {
	return fn().catch((error: unknown) => {
		const correlationId = randomUUID();
		const buildErrorResponse = (code: ErrorCode, message: string) => ({
			isError: true as const,
			content: [
				{
					type: "text" as const,
					text: JSON.stringify(
						{
							isError: true,
							code,
							message,
							correlationId,
						},
						null,
						2,
					),
				},
			],
		});

		if (error instanceof ExcalidrawMcpError) {
			return buildErrorResponse(error.code, error.message);
		}
		if (error instanceof Error) {
			return buildErrorResponse(
				ErrorCodes.E_OPERATION_UNSUPPORTED,
				`Internal Error: ${error.message}`,
			);
		}
		return buildErrorResponse(
			ErrorCodes.E_OPERATION_UNSUPPORTED,
			`Internal Error: ${String(error)}`,
		);
	});
}

/**
 * Counts active elements that carry a link, regardless of where the link is stored.
 */
export function countLinkedElements(doc: ExcalidrawMdDocument): number {
	const activeElementIds = new Set(
		doc.drawing.elements.filter((el) => !el.isDeleted).map((el) => el.id),
	);
	const linkedElementIds = new Set<string>();

	for (const elementId of Object.keys(doc.elementLinks)) {
		if (activeElementIds.has(elementId)) {
			linkedElementIds.add(elementId);
		}
	}

	for (const element of doc.drawing.elements) {
		if (element.isDeleted) {
			continue;
		}
		if (typeof element.link === "string" && element.link.trim() !== "") {
			linkedElementIds.add(element.id);
		}
	}

	return linkedElementIds.size;
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
	server.registerTool(
		"inspect_drawing",
		{
			description:
				"Read-only inspection of an .excalidraw.md document. Supports summary, elements, element, text, links, and query modes.",
			inputSchema: {
				...FilePathSchema.shape,
				mode: z
					.enum(["summary", "elements", "element", "text", "links", "query"])
					.optional()
					.describe("Inspection mode. Defaults to summary."),
				elementId: z.string().optional().describe("Required for mode=element."),
				search: z
					.string()
					.optional()
					.describe("Search keyword for mode=query."),
			},
			annotations: {
				readOnlyHint: true,
			},
		},
		async ({ filePath, mode, elementId, search }) => {
			return withErrorHandling(async () => {
				const vaultPath = getVaultPathOrThrow();
				const { content, fileStat } = await readVaultFile(vaultPath, filePath);
				const doc = parseToDocument(content, filePath, fileStat);
				const inspectMode = mode ?? "summary";

				switch (inspectMode) {
					case "summary": {
						const activeElements = doc.drawing.elements.filter(
							(el) => !el.isDeleted,
						);
						const edgeCount = activeElements.filter(
							(el) => el.type === "arrow" || el.type === "line",
						).length;

						return {
							content: [
								{
									type: "text",
									text: JSON.stringify(
										{
											summary: {
												filePath,
												drawingEncoding: doc.drawingEncoding,
												totalElements: activeElements.length,
												edgeCount,
												textElementsCount: Object.keys(doc.textElements).length,
												linkedElementsCount: countLinkedElements(doc),
											},
										},
										null,
										2,
									),
								},
							],
						};
					}

					case "elements": {
						return {
							content: [
								{
									type: "text",
									text: JSON.stringify(
										{
											elements: doc.drawing.elements,
										},
										null,
										2,
									),
								},
							],
						};
					}

					case "element": {
						if (!elementId) {
							throw new Error("elementId is required when mode=element");
						}

						const element = doc.drawing.elements.find(
							(el) => el.id === elementId,
						);
						if (!element) {
							throw new ExcalidrawMcpError(
								ErrorCodes.E_NOT_FOUND_ELEMENT,
								`Element not found: ${elementId}`,
							);
						}

						return {
							content: [
								{
									type: "text",
									text: JSON.stringify(
										{
											element,
											text: doc.textElements[elementId] ?? null,
											link: doc.elementLinks[elementId] ?? null,
										},
										null,
										2,
									),
								},
							],
						};
					}

					case "text": {
						return {
							content: [
								{
									type: "text",
									text: JSON.stringify(
										{ textElements: doc.textElements },
										null,
										2,
									),
								},
							],
						};
					}

					case "links": {
						return {
							content: [
								{
									type: "text",
									text: JSON.stringify(
										{ elementLinks: doc.elementLinks },
										null,
										2,
									),
								},
							],
						};
					}

					case "query": {
						if (!search?.trim()) {
							throw new Error("search is required when mode=query");
						}

						const needle = search.toLowerCase();
						const matches = doc.drawing.elements.filter((el) => {
							const candidateTexts = [
								typeof el.text === "string" ? el.text : "",
								typeof el.label === "string" ? el.label : "",
								doc.textElements[el.id] ?? "",
							];
							return candidateTexts.some((text) =>
								text.toLowerCase().includes(needle),
							);
						});

						return {
							content: [
								{
									type: "text",
									text: JSON.stringify({ search, matches }, null, 2),
								},
							],
						};
					}

					default:
						throw new Error(`Unsupported inspect mode: ${inspectMode}`);
				}
			});
		},
	);

	// Snapshot Management Tools
	server.registerTool(
		"snapshot_drawing",
		{
			description:
				"Manages snapshots of Excalidraw drawings. Supports create, list, and restore operations.",
			inputSchema: {
				...FilePathSchema.shape,
				action: z
					.enum(["create", "list", "restore"])
					.describe("Action to perform: create, list, or restore"),
				snapshotFileName: z
					.string()
					.optional()
					.describe(
						"Required for restore: name of the snapshot file to restore",
					),
			},
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
	server.registerTool(
		"convert_drawing_format",
		{
			description:
				"Converts between .excalidraw.md and .excalidraw JSON formats.",
			inputSchema: {
				...FilePathSchema.shape,
				action: z
					.enum(["export_excalidraw_json", "import_excalidraw_json"])
					.optional()
					.describe(
						"Preferred action. export_excalidraw_json exports markdown to JSON; import_excalidraw_json imports JSON to markdown.",
					),
				direction: z
					.enum(["to-json", "to-markdown"])
					.optional()
					.describe("Conversion direction: to-json or to-markdown"),
				outputPath: z
					.string()
					.describe(
						"Output file path (relative to vault) for the converted file",
					),
			},
		},
		async (params) => {
			return withErrorHandling(async () => {
				const vaultPath = getVaultPathOrThrow();
				const direction =
					params.direction ??
					(params.action === "export_excalidraw_json"
						? "to-json"
						: params.action === "import_excalidraw_json"
							? "to-markdown"
							: undefined);

				if (!direction) {
					throw new Error(
						"Either action or direction must be provided for convert_drawing_format.",
					);
				}

				switch (direction) {
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
								ErrorCodes.E_PARSE_INVALID_MD,
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
