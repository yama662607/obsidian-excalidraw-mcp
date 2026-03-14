import { parseToDocument, rebuildMarkdown } from "@core/parser/parser";
import {
	type AddEdgeOptions,
	type AddNodeOptions,
	type ArrangeOptions,
	addEdge,
	addNode,
	arrangeElements,
	deleteElements,
	type ElementUpdatePatch,
	updateElements,
} from "@core/services/editing";
import { readVaultFile, writeVaultFileAtomically } from "@core/storage/storage";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
	FilePathSchema,
	getVaultPathOrThrow,
	withErrorHandling,
} from "./parsers";

export function registerEditing(server: McpServer) {
	// 1. Add Node
	server.registerTool(
		"add_node",
		{
			description:
				"Adds a new node (rectangle, text, etc.) to an Excalidraw document.",
			inputSchema: {
				...FilePathSchema.shape,
				type: z
					.enum(["rectangle", "ellipse", "diamond", "text", "frame"])
					.describe("Type of node"),
				x: z.number(),
				y: z.number(),
				width: z.number().optional(),
				height: z.number().optional(),
				text: z.string().optional().describe("Text to display inside the node"),
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

				const { doc: newDoc, addedIds } = addNode(
					doc,
					params as AddNodeOptions,
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
						{ type: "text", text: `Node added. IDs: ${addedIds.join(", ")}` },
					],
				};
			});
		},
	);

	// 2. Add Edge
	server.registerTool(
		"add_edge",
		{
			description: "Links two nodes together with an arrow or line.",
			inputSchema: {
				...FilePathSchema.shape,
				startId: z.string().describe("Element ID to start the edge from"),
				endId: z.string().describe("Element ID to end the edge at"),
				type: z.enum(["arrow", "line"]).optional(),
				text: z.string().optional().describe("Text label to put on the edge"),
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

				const { doc: newDoc, addedIds } = addEdge(
					doc,
					params as AddEdgeOptions,
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
						{ type: "text", text: `Edge added. IDs: ${addedIds.join(", ")}` },
					],
				};
			});
		},
	);

	// 3. Update Elements
	server.registerTool(
		"update_elements",
		{
			description:
				"Updates properties of existing elements (e.g. text content, coordinates).",
			inputSchema: {
				...FilePathSchema.shape,
				patches: z
					.array(
						z
							.object({
								id: z.string(),
							})
							.catchall(z.unknown()),
					)
					.describe("Array of patches. Must include `id`."),
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

				const docPatches: ElementUpdatePatch[] = params.patches;

				const newDoc = updateElements(doc, docPatches);

				const outMarkdown = rebuildMarkdown(newDoc);
				await writeVaultFileAtomically(
					vaultPath,
					params.filePath,
					outMarkdown,
					fileStat,
				);

				return {
					content: [{ type: "text", text: `Elements updated successfully.` }],
				};
			});
		},
	);

	// 4. Delete Elements
	server.registerTool(
		"delete_elements",
		{
			description: "Deletes elements by IDs and cleans up their connections.",
			inputSchema: {
				...FilePathSchema.shape,
				ids: z.array(z.string()).describe("List of element IDs to delete"),
			},
			annotations: {
				destructiveHint: true,
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

				const newDoc = deleteElements(doc, params.ids);

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
							text: `Deleted elements: ${params.ids.join(", ")}`,
						},
					],
				};
			});
		},
	);

	// 5. Arrange Elements
	server.registerTool(
		"arrange_elements",
		{
			description:
				"Arranges elements by aligning, distributing, grouping, or locking them.",
			inputSchema: {
				...FilePathSchema.shape,
				ids: z.array(z.string()).describe("List of element IDs to arrange"),
				action: z
					.discriminatedUnion("type", [
						z.object({
							type: z.literal("align"),
							axis: z.enum([
								"left",
								"center",
								"right",
								"top",
								"middle",
								"bottom",
							]),
						}),
						z.object({
							type: z.literal("distribute"),
							axis: z.enum(["horizontal", "vertical"]),
						}),
						z.object({ type: z.literal("group") }),
						z.object({ type: z.literal("ungroup") }),
						z.object({ type: z.literal("lock") }),
						z.object({ type: z.literal("unlock") }),
					])
					.describe(
						"Arrangement action: align (left/center/right/top/middle/bottom), distribute (horizontal/vertical), group, ungroup, lock, or unlock",
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

				const arrangeOptions: ArrangeOptions = {
					ids: params.ids,
					action: params.action,
				};
				const newDoc = arrangeElements(doc, arrangeOptions);

				const outMarkdown = rebuildMarkdown(newDoc);
				await writeVaultFileAtomically(
					vaultPath,
					params.filePath,
					outMarkdown,
					fileStat,
				);

				const actionDesc =
					"type" in params.action
						? `${params.action.type}${"axis" in params.action ? ` (${params.action.axis})` : ""}`
						: "unknown";

				return {
					content: [
						{
							type: "text",
							text: `Arranged elements: ${params.ids.join(", ")} with action: ${actionDesc}`,
						},
					],
				};
			});
		},
	);
}
