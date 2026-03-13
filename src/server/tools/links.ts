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
	// 1. Set Element Link
	server.tool(
		"excalidraw_set_link",
		"Attaches a markdown WikiLink to an element in Excalidraw.",
		{
			...FilePathSchema.shape,
			elementId: z.string().describe("ID of the element"),
			wikiLink: z
				.string()
				.describe("Obsidian WikiLink (e.g., [[My target note]])"),
		},
		async (params) => {
			return withErrorHandling(async () => {
				const vaultPath = getVaultPathOrThrow();
				const { content, fileStat } = await readVaultFile(
					vaultPath,
					params.filePath,
				);
				const doc = parseToDocument(content, params.filePath, fileStat);

				const newDoc = setElementLink(doc, params.elementId, params.wikiLink);

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
			});
		},
	);

	// 2. Remove Element Link
	server.tool(
		"excalidraw_remove_link",
		"Removes a wiki link from an element.",
		{
			...FilePathSchema.shape,
			elementId: z.string(),
		},
		async (params) => {
			return withErrorHandling(async () => {
				const vaultPath = getVaultPathOrThrow();
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
						{ type: "text", text: `Link removed from ${params.elementId}.` },
					],
				};
			});
		},
	);

	// 3. Repair Element Links
	server.tool(
		"excalidraw_repair_links",
		"Batch replaces links across a drawing. Useful when a file was globally renamed.",
		{
			...FilePathSchema.shape,
			pathUpdates: z
				.record(z.string(), z.string())
				.describe("Map of { 'old/path.md': 'new/path.md' }"),
		},
		async (params) => {
			return withErrorHandling(async () => {
				const vaultPath = getVaultPathOrThrow();
				const { content, fileStat } = await readVaultFile(
					vaultPath,
					params.filePath,
				);
				const doc = parseToDocument(content, params.filePath, fileStat);

				const { doc: newDoc, repairs } = repairElementLinks(
					doc,
					params.pathUpdates as Record<string, string>,
				);

				if (repairs.length === 0) {
					return {
						content: [{ type: "text", text: "No links required repairing." }],
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
					.map((r) => `[${r.elementId}] ${r.oldLink} -> ${r.newLink}`)
					.join("\n");
				return {
					content: [
						{
							type: "text",
							text: `Repaired ${repairs.length} links:\n${resultString}`,
						},
					],
				};
			});
		},
	);

	// 4. Create Note from Element
	server.tool(
		"create_note_from_element",
		"Creates a new Obsidian note from an element's text content and links the element to it.",
		{
			...FilePathSchema.shape,
			elementId: z.string().describe("ID of the element to create a note from"),
			notePath: z
				.string()
				.describe(
					"Path for the new note (e.g., 'My Note' or 'Folder/My Note')",
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

	// 5. Suggest Links for Elements
	server.tool(
		"suggest_links_for_elements",
		"Suggests existing Vault notes as link candidates based on element text content.",
		{
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
}
