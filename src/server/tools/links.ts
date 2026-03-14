import { parseToDocument, rebuildMarkdown } from "@core/parser/parser";
import {
	createNoteFromElement,
	removeElementLink,
	repairElementLinks,
	setElementLink,
} from "@core/services/links";
import {
	listVaultMarkdownFiles,
	readVaultFile,
	writeVaultFileAtomically,
} from "@core/storage/storage";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
	FilePathSchema,
	getVaultPathOrThrow,
	withErrorHandling,
} from "./parsers";

export function registerLinks(server: McpServer) {
	// 1. Manage Element Links (unified tool for get/set/remove/repair)
	server.registerTool(
		"manage_element_links",
		{
			description:
				"Manages Element Links (element ID → wiki link mappings). Supports get, set, remove, and repair operations.",
			inputSchema: {
				...FilePathSchema.shape,
				action: z
					.enum(["get", "set", "remove", "repair"])
					.describe(
						"Action to perform: get (list all), set (add/update), remove (delete), or repair (batch fix paths)",
					),
				elementId: z
					.string()
					.optional()
					.describe("Required for 'get', 'set', 'remove': element ID"),
				wikiLink: z
					.string()
					.optional()
					.describe(
						"Required for 'set': Obsidian WikiLink (e.g., [[My target note]])",
					),
				pathUpdates: z
					.record(z.string(), z.string())
					.optional()
					.describe("Optional map of { 'old/path': 'new/path' } overrides."),
			},
		},
		async (params) => {
			return withErrorHandling(async () => {
				const vaultPath = getVaultPathOrThrow();

				switch (params.action) {
					case "get": {
						if (!params.elementId) {
							// Get all links
							const { content, fileStat } = await readVaultFile(
								vaultPath,
								params.filePath,
							);
							const doc = parseToDocument(content, params.filePath, fileStat);

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
						} else {
							// Get specific element link
							const { content, fileStat } = await readVaultFile(
								vaultPath,
								params.filePath,
							);
							const doc = parseToDocument(content, params.filePath, fileStat);
							const link = doc.elementLinks[params.elementId];

							if (!link) {
								return {
									content: [
										{
											type: "text",
											text: `No link found for element ${params.elementId}.`,
										},
									],
								};
							}

							return {
								content: [
									{
										type: "text",
										text: JSON.stringify(
											{ elementId: params.elementId, link },
											null,
											2,
										),
									},
								],
							};
						}
					}

					case "set": {
						if (!params.elementId || !params.wikiLink) {
							throw new Error(
								"elementId and wikiLink are required for 'set' action",
							);
						}

						const { content, fileStat } = await readVaultFile(
							vaultPath,
							params.filePath,
						);
						const doc = parseToDocument(content, params.filePath, fileStat);

						const newDoc = setElementLink(
							doc,
							params.elementId,
							params.wikiLink,
						);

						const outMarkdown = rebuildMarkdown(newDoc);
						await writeVaultFileAtomically(
							vaultPath,
							params.filePath,
							outMarkdown,
							fileStat,
						);

						return {
							content: [
								{
									type: "text",
									text: `Link ${params.wikiLink} successfully attached to ${params.elementId}.`,
								},
							],
						};
					}

					case "remove": {
						if (!params.elementId) {
							throw new Error("elementId is required for 'remove' action");
						}

						const { content, fileStat } = await readVaultFile(
							vaultPath,
							params.filePath,
						);
						const doc = parseToDocument(content, params.filePath, fileStat);

						const newDoc = removeElementLink(doc, params.elementId);

						const outMarkdown = rebuildMarkdown(newDoc);
						await writeVaultFileAtomically(
							vaultPath,
							params.filePath,
							outMarkdown,
							fileStat,
						);

						return {
							content: [
								{
									type: "text",
									text: `Link removed from ${params.elementId}.`,
								},
							],
						};
					}

					case "repair": {
						const { content, fileStat } = await readVaultFile(
							vaultPath,
							params.filePath,
						);
						const doc = parseToDocument(content, params.filePath, fileStat);

						const { doc: newDoc, repairs } = repairElementLinks(
							doc,
							(params.pathUpdates ?? {}) as Record<string, string>,
						);

						if (repairs.length === 0) {
							return {
								content: [
									{ type: "text", text: "No links required repairing." },
								],
							};
						}

						const outMarkdown = rebuildMarkdown(newDoc);
						await writeVaultFileAtomically(
							vaultPath,
							params.filePath,
							outMarkdown,
							fileStat,
						);

						const resultString = repairs
							.map((r) =>
								r.action === "removed"
									? `[${r.elementId}] removed stale link: ${r.oldLink}`
									: `[${r.elementId}] ${r.oldLink} -> ${r.newLink}`,
							)
							.join("\n");
						return {
							content: [
								{
									type: "text",
									text: `Repaired ${repairs.length} links:\n${resultString}`,
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

	// 2. Suggest Links for Elements
	server.registerTool(
		"suggest_links_for_elements",
		{
			description:
				"Suggests existing Vault notes as link candidates based on element text content.",
			inputSchema: {
				...FilePathSchema.shape,
				elementIds: z
					.array(z.string())
					.describe("List of element IDs to suggest links for"),
				maxSuggestions: z
					.number()
					.min(1)
					.max(50)
					.optional()
					.describe(
						"Maximum number of suggestions to return per element (default: 10)",
					),
			},
			annotations: {
				readOnlyHint: true,
			},
		},
		async (params) => {
			return withErrorHandling(async () => {
				const vaultPath = getVaultPathOrThrow();
				const { content, fileStat } = await readVaultFile(
					vaultPath,
					params.filePath,
				);
				const doc = parseToDocument(content, params.filePath, fileStat);

				// Get all markdown files in the vault
				const vaultFiles = await listVaultMarkdownFiles(vaultPath);

				const maxSuggestions = params.maxSuggestions || 10;
				const suggestions: Record<
					string,
					Array<{ path: string; score: number }>
				> = {};

				// Calculate similarity scores for each element
				for (const elementId of params.elementIds) {
					const elementText: string =
						(doc.textElements[elementId] as string | undefined) ||
						(doc.drawing.elements.find((e) => e.id === elementId)?.text as
							| string
							| undefined) ||
						"";

					if (!elementText) {
						suggestions[elementId] = [];
						continue;
					}

					// Simple matching: exact match, then case-insensitive, then includes
					const matches = vaultFiles
						.map((filePath) => {
							const fileName = filePath.split("/").pop() || filePath;
							let score = 0;

							// Exact match
							if (fileName === elementText) {
								score = 100;
							}
							// Case-insensitive match
							else if (fileName.toLowerCase() === elementText.toLowerCase()) {
								score = 80;
							}
							// Includes element text
							else if (
								fileName.toLowerCase().includes(elementText.toLowerCase())
							) {
								score = 60;
							}
							// Element text includes file name
							else if (
								elementText.toLowerCase().includes(fileName.toLowerCase())
							) {
								score = 50;
							}

							return { path: filePath, score };
						})
						.filter((m) => m.score > 0)
						.sort((a, b) => b.score - a.score)
						.slice(0, maxSuggestions);

					suggestions[elementId] = matches;
				}

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify({ suggestions }, null, 2),
						},
					],
				};
			});
		},
	);

	// 3. Create Note from Element
	server.registerTool(
		"create_note_from_element",
		{
			description:
				"Creates a new Obsidian note from an element's text content and links the element to it.",
			inputSchema: {
				...FilePathSchema.shape,
				elementId: z
					.string()
					.describe("ID of the element to create a note from"),
				notePath: z
					.string()
					.describe(
						"Path for the new note (e.g., 'My Note' or 'Folder/My Note')",
					),
			},
		},
		async (params) => {
			return withErrorHandling(async () => {
				const vaultPath = getVaultPathOrThrow();
				const { content, fileStat } = await readVaultFile(
					vaultPath,
					params.filePath,
				);
				const doc = parseToDocument(content, params.filePath, fileStat);

				const { doc: newDoc, noteContent } = createNoteFromElement(
					doc,
					params.elementId,
					params.notePath,
				);

				// Write the new note file
				const noteFileName = `${params.notePath}.md`;
				await writeVaultFileAtomically(vaultPath, noteFileName, noteContent);

				// Update and save the drawing
				const outMarkdown = rebuildMarkdown(newDoc);
				await writeVaultFileAtomically(
					vaultPath,
					params.filePath,
					outMarkdown,
					fileStat,
				);

				return {
					content: [
						{
							type: "text",
							text: `Created note [[${params.notePath}]] and linked element ${params.elementId} to it.`,
						},
					],
				};
			});
		},
	);
}
