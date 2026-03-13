import { parseToDocument, rebuildMarkdown } from "@core/parser/parser";
import {
	removeElementLink,
	repairElementLinks,
	setElementLink,
} from "@core/services/links";
import { readVaultFile, writeVaultFileAtomically } from "@core/storage/storage";
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
}
