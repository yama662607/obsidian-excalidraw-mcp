import { parseToDocument } from "@core/parser/parser";
import { readVaultFile } from "@core/storage/storage";
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
		"excalidraw_read_document",
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
}
