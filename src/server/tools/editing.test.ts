import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { parseToDocument } from "@core/parser/parser";
import { ErrorCodes } from "@core/types";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import { registerEditing } from "./editing";

type ToolHandler = (params: Record<string, unknown>) => Promise<unknown>;

function createToolServerForTests(): {
	server: McpServer;
	handlers: Map<string, ToolHandler>;
} {
	const handlers = new Map<string, ToolHandler>();

	const server = {
		registerTool: (name: string, _options: unknown, handler: ToolHandler) => {
			handlers.set(name, handler);
		},
	};

	return {
		server: server as unknown as McpServer,
		handlers,
	};
}

function createArrangeTestMarkdown(): string {
	return `---
excalidraw-plugin: parsed
---

# Excalidraw Data

## Drawing
\`\`\`json
{"type":"excalidraw","version":2,"source":"test","elements":[{"id":"a","type":"rectangle","x":0,"y":0,"width":100,"height":60,"groupIds":[],"isDeleted":false},{"id":"b","type":"rectangle","x":180,"y":0,"width":100,"height":60,"groupIds":[],"isDeleted":false}]}
\`\`\`
%%`;
}

describe("server tools/editing arrange_elements", () => {
	it("accepts legacy string action for group", async () => {
		const tempFilePath = `tmp-editing-${Date.now()}-group.excalidraw.md`;
		await writeFile(tempFilePath, createArrangeTestMarkdown(), "utf-8");

		try {
			const { server, handlers } = createToolServerForTests();
			registerEditing(server);
			const arrangeElements = handlers.get("arrange_elements");
			expect(arrangeElements).toBeDefined();

			await arrangeElements?.({
				filePath: tempFilePath,
				ids: ["a", "b"],
				action: "group",
			});

			const written = await readFile(tempFilePath, "utf-8");
			const fileStat = await stat(tempFilePath);
			const parsed = parseToDocument(written, tempFilePath, {
				mtimeMs: fileStat.mtimeMs,
				size: fileStat.size,
				sha256: "x".repeat(64),
			});
			const target = parsed.drawing.elements.filter(
				(el) => el.id === "a" || el.id === "b",
			);

			expect(target).toHaveLength(2);
			expect(target[0].groupIds.length).toBeGreaterThan(0);
			expect(target[0].groupIds).toEqual(target[1].groupIds);
		} finally {
			await rm(tempFilePath, { force: true });
		}
	});

	it("returns a clear error when align is passed as a bare string", async () => {
		const tempFilePath = `tmp-editing-${Date.now()}-align.excalidraw.md`;
		await writeFile(tempFilePath, createArrangeTestMarkdown(), "utf-8");

		try {
			const { server, handlers } = createToolServerForTests();
			registerEditing(server);
			const arrangeElements = handlers.get("arrange_elements");
			expect(arrangeElements).toBeDefined();

			const result = (await arrangeElements?.({
				filePath: tempFilePath,
				ids: ["a", "b"],
				action: "align",
			})) as {
				isError?: boolean;
				content: Array<{ text: string }>;
			};

			expect(result.isError).toBe(true);
			const payload = JSON.parse(result.content[0].text) as {
				isError: boolean;
				code: string;
				message: string;
			};
			expect(payload.code).toBe(ErrorCodes.E_OPERATION_UNSUPPORTED);
			expect(payload.message).toContain("requires axis");
		} finally {
			await rm(tempFilePath, { force: true });
		}
	});
});
