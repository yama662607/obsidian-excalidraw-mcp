import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "./config";
import { registerAnalysis } from "./tools/analysis";
import { registerEditing } from "./tools/editing";
import { registerLinks } from "./tools/links";
import { registerParsers } from "./tools/parsers";

export const server = new McpServer({
	name: "obsidian-excalidraw-visual-knowledge",
	version: "1.0.0",
});

let modulesRegistered = false;

/**
 * Main entry point for the MCP Server.
 */
export async function runServer() {
	// Validate basic config
	if (!config.vaultPath) {
		console.error(
			"FATAL: OBSIDIAN_VAULT_PATH environment variable or --vault argument is required.",
		);
		process.exit(1);
	}

	if (!modulesRegistered) {
		registerParsers(server);
		registerEditing(server);
		registerLinks(server);
		registerAnalysis(server);
		modulesRegistered = true;
	}

	// Connect standard I/O transport
	const transport = new StdioServerTransport();
	await server.connect(transport);

	// eslint-disable-next-line no-console
	console.error(
		`Excalidraw MCP Server running. Vault Path: ${config.vaultPath}`,
	);
}
