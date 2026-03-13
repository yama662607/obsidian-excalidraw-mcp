import { parseToDocument } from "@core/parser/parser";
import {
	extractGraph,
	findDuplicateLinks,
	findUnlinkedElements,
} from "@core/services/analysis";
import { readVaultFile } from "@core/storage/storage";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
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

	// 4. Analyze Drawing (Unified Analysis Tool)
	server.tool(
		"analyze_drawing",
		"Comprehensive analysis of the Excalidraw drawing. Supports multiple analysis types via the 'query' parameter.",
		{
			...FilePathSchema.shape,
			query: z
				.enum([
					"summary",
					"elements",
					"element",
					"text",
					"links",
					"graph",
					"unlinked",
					"duplicates",
				])
				.describe("Type of analysis to perform"),
			elementId: z
				.string()
				.optional()
				.describe(
					"Required for 'element' query: specific element ID to analyze",
				),
		},
		async (params) => {
			return withErrorHandling(async () => {
				const vaultPath = getVaultPathOrThrow();
				const { content, fileStat } = await readVaultFile(
					vaultPath,
					params.filePath,
				);
				const doc = parseToDocument(content, params.filePath, fileStat);

				switch (params.query) {
					case "summary": {
						const graph = extractGraph(doc);
						const unlinked = findUnlinkedElements(doc);
						const duplicates = findDuplicateLinks(doc);

						return {
							content: [
								{
									type: "text",
									text: JSON.stringify(
										{
											summary: {
												totalElements: doc.drawing.elements.length,
												nodesCount: graph.nodes.length,
												edgesCount: graph.edges.length,
												textElementsCount: Object.keys(doc.textElements).length,
												linkedElementsCount: Object.keys(doc.elementLinks)
													.length,
												unlinkedElementsCount: unlinked.length,
												duplicateLinkGroupsCount: duplicates.length,
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
											elements: doc.drawing.elements.map((el) => ({
												id: el.id,
												type: el.type,
												x: el.x,
												y: el.y,
												width: el.width,
												height: el.height,
												text: doc.textElements[el.id] || el.text || null,
												link: doc.elementLinks[el.id] || el.link || null,
											})),
										},
										null,
										2,
									),
								},
							],
						};
					}

					case "element": {
						if (!params.elementId) {
							throw new Error(
								"elementId parameter is required for 'element' query",
							);
						}
						const element = doc.drawing.elements.find(
							(e) => e.id === params.elementId,
						);
						if (!element) {
							throw new Error(`Element ${params.elementId} not found`);
						}

						return {
							content: [
								{
									type: "text",
									text: JSON.stringify(
										{
											element: {
												id: element.id,
												type: element.type,
												x: element.x,
												y: element.y,
												width: element.width,
												height: element.height,
												text:
													doc.textElements[params.elementId] ||
													element.text ||
													null,
												link:
													doc.elementLinks[params.elementId] ||
													element.link ||
													null,
											},
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
										{
											textElements: doc.textElements,
											count: Object.keys(doc.textElements).length,
										},
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
										{
											elementLinks: doc.elementLinks,
											count: Object.keys(doc.elementLinks).length,
										},
										null,
										2,
									),
								},
							],
						};
					}

					case "graph": {
						const graph = extractGraph(doc);
						return {
							content: [{ type: "text", text: JSON.stringify(graph, null, 2) }],
						};
					}

					case "unlinked": {
						const unlinked = findUnlinkedElements(doc);
						return {
							content: [
								{
									type: "text",
									text: JSON.stringify({ unlinkedElements: unlinked }, null, 2),
								},
							],
						};
					}

					case "duplicates": {
						const duplicates = findDuplicateLinks(doc);
						return {
							content: [
								{
									type: "text",
									text: JSON.stringify({ duplicateLinks: duplicates }, null, 2),
								},
							],
						};
					}

					default:
						return {
							content: [{ type: "text", text: "Unknown query type" }],
						};
				}
			});
		},
	);
}
