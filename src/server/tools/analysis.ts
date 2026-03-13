import { parseToDocument } from "@core/parser/parser";
import {
	extractGraph,
	findDuplicateLinks,
	findUnlinkedElements,
} from "@core/services/analysis";
import { readVaultFile } from "@core/storage/storage";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	FilePathSchema,
	getVaultPathOrThrow,
	withErrorHandling,
} from "./parsers";

export function registerAnalysis(server: McpServer) {
	// 1. Extract Graph
	server.tool(
		"excalidraw_extract_graph",
		"Extracts a normalized graph structure (nodes and directed edges) from the Excalidraw drawing.",
		FilePathSchema.shape,
		async (params) => {
			return withErrorHandling(async () => {
				const vaultPath = getVaultPathOrThrow();
				const { content, fileStat } = await readVaultFile(
					vaultPath,
					params.filePath,
				);
				const doc = parseToDocument(content, params.filePath, fileStat);

				const graph = extractGraph(doc);

				return {
					content: [{ type: "text", text: JSON.stringify(graph, null, 2) }],
				};
			});
		},
	);

	// 2. Find Unlinked Elements
	server.tool(
		"excalidraw_find_unlinked",
		"Finds elements with text content that are not linked to any standard Markdown note.",
		FilePathSchema.shape,
		async (params) => {
			return withErrorHandling(async () => {
				const vaultPath = getVaultPathOrThrow();
				const { content, fileStat } = await readVaultFile(
					vaultPath,
					params.filePath,
				);
				const doc = parseToDocument(content, params.filePath, fileStat);

				const unlinked = findUnlinkedElements(doc);
				const summaries = unlinked.map((u) => ({
					id: u.id,
					text: doc.textElements[u.id] || u.text || "Unknown text/bindings",
				}));

				if (summaries.length === 0) {
					return {
						content: [
							{ type: "text", text: "No unlinked text elements found." },
						],
					};
				}

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify({ unlinkedElements: summaries }, null, 2),
						},
					],
				};
			});
		},
	);

	// 3. Find Duplicate Links
	server.tool(
		"excalidraw_find_duplicates",
		"Detects if multiple separate visual elements link to the same Markdown note.",
		FilePathSchema.shape,
		async (params) => {
			return withErrorHandling(async () => {
				const vaultPath = getVaultPathOrThrow();
				const { content, fileStat } = await readVaultFile(
					vaultPath,
					params.filePath,
				);
				const doc = parseToDocument(content, params.filePath, fileStat);

				const duplicates = findDuplicateLinks(doc);

				if (duplicates.length === 0) {
					return {
						content: [{ type: "text", text: "No duplicate links found." }],
					};
				}

				return {
					content: [
						{ type: "text", text: JSON.stringify({ duplicates }, null, 2) },
					],
				};
			});
		},
	);
}
