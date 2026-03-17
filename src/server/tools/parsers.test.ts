import { rm, writeFile } from "node:fs/promises";
import {
	ErrorCodes,
	ExcalidrawMcpError,
	type ExcalidrawMdDocument,
} from "@core/types";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import {
	countLinkedElements,
	registerParsers,
	withErrorHandling,
} from "./parsers";

function createDocForLinkedCountTest(): ExcalidrawMdDocument {
	return {
		path: "diagram.excalidraw.md",
		frontmatter: null,
		rawFrontmatterText: null,
		headerNoticeText: null,
		textElements: {},
		elementLinks: {
			rectA: "[[note/rect-a]]",
			bothA: "[[note/both-a]]",
			deletedA: "[[note/deleted-a]]",
		},
		embeddedFiles: null,
		drawing: {
			type: "excalidraw",
			version: 2,
			elements: [
				{
					id: "rectA",
					type: "rectangle",
					x: 0,
					y: 0,
					width: 100,
					height: 50,
					groupIds: [],
					isDeleted: false,
				},
				{
					id: "embedA",
					type: "embeddable",
					x: 10,
					y: 10,
					width: 140,
					height: 90,
					groupIds: [],
					isDeleted: false,
					link: "[[note/embed-a]]",
				},
				{
					id: "bothA",
					type: "rectangle",
					x: 20,
					y: 20,
					width: 120,
					height: 70,
					groupIds: [],
					isDeleted: false,
					link: "[[note/both-a]]",
				},
				{
					id: "deletedA",
					type: "embeddable",
					x: 30,
					y: 30,
					width: 120,
					height: 80,
					groupIds: [],
					isDeleted: true,
					link: "[[note/deleted-a]]",
				},
			],
		},
		drawingEncoding: "json",
		originalText: "",
		fileStat: {
			mtimeMs: 1,
			size: 1,
			sha256: "x".repeat(64),
		},
	};
}

function createEmbeddableLinkedDrawingMarkdown(): string {
	return `---
excalidraw-plugin: parsed
---

# Excalidraw Data

## Drawing
\`\`\`json
{"type":"excalidraw","version":2,"source":"test","elements":[{"id":"embed1","type":"embeddable","x":0,"y":0,"width":100,"height":60,"groupIds":[],"isDeleted":false,"link":"[[note/embedded]]"}]}
\`\`\`
%%`;
}

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

describe("server tools/parsers", () => {
	it("counts linked elements consistently including embeddable element links", () => {
		const doc = createDocForLinkedCountTest();
		expect(countLinkedElements(doc)).toBe(3);
	});

	it("returns structured errors for not found/parse/path-outside-vault failures", async () => {
		const cases = [
			{
				code: ErrorCodes.E_NOT_FOUND_NOTE,
				message: "note not found",
			},
			{
				code: ErrorCodes.E_PARSE_INVALID_MD,
				message: "parse failed",
			},
			{
				code: ErrorCodes.E_STORAGE_PATH_OUTSIDE_VAULT,
				message: "outside vault",
			},
		];

		for (const testCase of cases) {
			const result = await withErrorHandling(async () => {
				throw new ExcalidrawMcpError(testCase.code, testCase.message);
			});

			expect(result).toHaveProperty("isError", true);
			expect(result).toHaveProperty("structuredContent");
			const payload = JSON.parse(
				(result as { content: Array<{ text: string }> }).content[0].text,
			) as {
				isError: boolean;
				code: string;
				message: string;
				correlationId: string;
			};
			const structuredPayload = (
				result as {
					structuredContent: {
						isError: boolean;
						code: string;
						message: string;
						correlationId: string;
					};
				}
			).structuredContent;

			expect(payload.isError).toBe(true);
			expect(payload.code).toBe(testCase.code);
			expect(payload.message).toBe(testCase.message);
			expect(payload.correlationId.length).toBeGreaterThan(0);
			expect(structuredPayload).toEqual(payload);
		}
	});

	it("keeps summary linkedElementsCount aligned with elements output", async () => {
		const tempFilePath = `tmp-parsers-${Date.now()}.excalidraw.md`;
		await writeFile(
			tempFilePath,
			createEmbeddableLinkedDrawingMarkdown(),
			"utf-8",
		);

		try {
			const { server, handlers } = createToolServerForTests();
			registerParsers(server);
			const inspectDrawing = handlers.get("inspect_drawing");
			expect(inspectDrawing).toBeDefined();

			const summaryResult = (await inspectDrawing?.({
				filePath: tempFilePath,
				mode: "summary",
			})) as {
				content: Array<{ text: string }>;
			};

			const elementsResult = (await inspectDrawing?.({
				filePath: tempFilePath,
				mode: "elements",
			})) as {
				content: Array<{ text: string }>;
			};

			const summaryPayload = JSON.parse(summaryResult.content[0].text) as {
				summary: { linkedElementsCount: number };
			};
			const elementsPayload = JSON.parse(elementsResult.content[0].text) as {
				elements: Array<{ isDeleted?: boolean; link?: string }>;
			};

			const linkedInElements = elementsPayload.elements.filter(
				(el) =>
					!el.isDeleted && typeof el.link === "string" && el.link.trim() !== "",
			).length;

			expect(summaryPayload.summary.linkedElementsCount).toBe(linkedInElements);
		} finally {
			await rm(tempFilePath, { force: true });
		}
	});

	it("returns E_NOT_FOUND_ELEMENT in structured format for missing element lookup", async () => {
		const tempFilePath = `tmp-parsers-${Date.now()}-missing.excalidraw.md`;
		await writeFile(
			tempFilePath,
			createEmbeddableLinkedDrawingMarkdown(),
			"utf-8",
		);

		try {
			const { server, handlers } = createToolServerForTests();
			registerParsers(server);
			const inspectDrawing = handlers.get("inspect_drawing");
			expect(inspectDrawing).toBeDefined();

			const result = (await inspectDrawing?.({
				filePath: tempFilePath,
				mode: "element",
				elementId: "not-existing-id",
			})) as {
				isError?: boolean;
				structuredContent?: {
					isError: boolean;
					code: string;
					message: string;
					correlationId: string;
				};
				content: Array<{ text: string }>;
			};

			expect(result.isError).toBe(true);
			const payload = JSON.parse(result.content[0].text) as {
				isError: boolean;
				code: string;
				message: string;
			};

			expect(payload.isError).toBe(true);
			expect(payload.code).toBe(ErrorCodes.E_NOT_FOUND_ELEMENT);
			expect(payload.message).toContain("Element not found");
			expect(result.structuredContent).toEqual(payload);
		} finally {
			await rm(tempFilePath, { force: true });
		}
	});
});
