import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import { registerAnalysis } from "./analysis";
import { registerEditing } from "./editing";
import { registerLinks } from "./links";
import { registerParsers } from "./parsers";

type ToolCall = {
	name: string;
	options: {
		annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean };
	};
};

function createMockServer(calls: ToolCall[]): McpServer {
	const mock = {
		registerTool: (name: string, options: ToolCall["options"]) => {
			calls.push({ name, options });
		},
		tool: (name: string) => {
			calls.push({ name, options: {} });
		},
	};

	return mock as unknown as McpServer;
}

describe("MCP tool registration", () => {
	it("registers exactly the expected 12 tools with no duplicates", () => {
		const calls: ToolCall[] = [];
		const server = createMockServer(calls);

		registerParsers(server);
		registerEditing(server);
		registerLinks(server);
		registerAnalysis(server);

		const names = calls.map((c) => c.name);
		expect(new Set(names).size).toBe(12);
		expect(names.sort()).toEqual(
			[
				"inspect_drawing",
				"add_node",
				"add_edge",
				"update_elements",
				"delete_elements",
				"arrange_elements",
				"manage_element_links",
				"suggest_links_for_elements",
				"create_note_from_element",
				"analyze_drawing",
				"snapshot_drawing",
				"convert_drawing_format",
			].sort(),
		);
	});

	it("applies required readOnly/destructive annotations", () => {
		const calls: ToolCall[] = [];
		const server = createMockServer(calls);

		registerParsers(server);
		registerEditing(server);
		registerLinks(server);
		registerAnalysis(server);

		const findTool = (name: string) => calls.find((c) => c.name === name);

		expect(findTool("inspect_drawing")?.options.annotations?.readOnlyHint).toBe(
			true,
		);
		expect(findTool("analyze_drawing")?.options.annotations?.readOnlyHint).toBe(
			true,
		);
		expect(
			findTool("suggest_links_for_elements")?.options.annotations?.readOnlyHint,
		).toBe(true);
		expect(
			findTool("delete_elements")?.options.annotations?.destructiveHint,
		).toBe(true);
	});
});
