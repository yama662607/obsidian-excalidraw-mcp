import type { ExcalidrawMdDocument, ExcalidrawScene } from "@core/types";
import { beforeEach, describe, expect, it } from "vitest";
import {
	extractGraph,
	findDuplicateLinks,
	findUnlinkedElements,
} from "./analysis";

describe("Knowledge Analysis Service", () => {
	let doc: ExcalidrawMdDocument;

	beforeEach(() => {
		const scene: ExcalidrawScene = {
			type: "excalidraw",
			version: 1,
			elements: [
				{
					id: "e1",
					type: "rectangle",
					x: 0,
					y: 0,
					width: 10,
					height: 10,
					groupIds: [],
					boundElements: [{ id: "t1", type: "text" }],
				},
				{
					id: "t1",
					type: "text",
					x: 2,
					y: 2,
					width: 5,
					height: 5,
					groupIds: [],
					text: "Node A",
					containerId: "e1",
				},

				{
					id: "e2",
					type: "rectangle",
					x: 100,
					y: 100,
					width: 10,
					height: 10,
					groupIds: [],
					link: "[[Note-B]]",
				},

				{
					id: "e3",
					type: "arrow",
					x: 10,
					y: 10,
					width: 90,
					height: 90,
					groupIds: [],
					startBinding: { elementId: "e1" },
					endBinding: { elementId: "e2" },
				},
			],
		};

		doc = {
			path: "/test.md",
			frontmatter: null,
			rawFrontmatterText: null,
			headerNoticeText: "",
			textElements: { t1: "Node A" },
			elementLinks: { e2: "[[Note-B]]" },
			embeddedFiles: null,
			drawing: scene,
			drawingEncoding: "json",
			originalText: "",
			fileStat: { mtimeMs: 0, size: 0, sha256: "" },
		};
	});

	describe("extractGraph", () => {
		it("should extract nodes and directed edges", () => {
			const graph = extractGraph(doc);

			expect(graph.nodes.length).toBe(3); // e1, e2, and t1 (text node)
			expect(graph.nodes.find((n) => n.id === "e1")).toBeDefined();
			expect(graph.nodes.find((n) => n.id === "e2")).toBeDefined();

			expect(graph.edges.length).toBe(1);
			const edge = graph.edges[0];
			expect(edge.fromId).toBe("e1");
			expect(edge.toId).toBe("e2");
			expect(edge.edgeId).toBe("e3");
			expect(edge.label).toBeUndefined();
		});

		it("should extract labeled edges", () => {
			// Add text bound to edge
			doc.drawing.elements.push({
				id: "t2",
				type: "text",
				x: 50,
				y: 50,
				width: 5,
				height: 5,
				groupIds: [],
				text: "connects",
				containerId: "e3",
			});
			const edge = doc.drawing.elements.find((e) => e.id === "e3");
			expect(edge).toBeDefined();
			if (!edge) {
				throw new Error("Missing edge e3");
			}
			edge.boundElements = [{ id: "t2", type: "text" }];
			doc.textElements.t2 = "connects";

			const graph = extractGraph(doc);
			expect(graph.edges[0].label).toBe("connects");
		});
	});

	describe("findUnlinkedElements", () => {
		it("should find nodes with text that are not linked", () => {
			const unlinked = findUnlinkedElements(doc);
			// It should find e1 (container with text bound)
			// and t1 (standalone text inside e1)
			// but not e2 because e2 has a link
			expect(unlinked.length).toBe(2);
			expect(unlinked.find((u) => u.id === "e1")).toBeDefined();
			expect(unlinked.find((u) => u.id === "t1")).toBeDefined();
		});

		it("should ignore empty shapes", () => {
			doc.drawing.elements.push({
				id: "empty",
				type: "rectangle",
				x: 200,
				y: 200,
				width: 10,
				height: 10,
				groupIds: [],
			});
			const unlinked = findUnlinkedElements(doc);

			// Still 2 because "empty" has no text, so it is ignored
			expect(unlinked.length).toBe(2);
		});
	});

	describe("findDuplicateLinks", () => {
		it("should find multiple elements linking to the same alias", () => {
			// e2 -> Note-B
			// Add a new element that also links to Note-B
			doc.drawing.elements.push({
				id: "e4",
				type: "rectangle",
				x: 200,
				y: 200,
				width: 10,
				height: 10,
				groupIds: [],
				link: "[[Note-B|Alias]]",
			});
			doc.elementLinks.e4 = "[[Note-B|Alias]]";

			const duplicates = findDuplicateLinks(doc);
			expect(duplicates.length).toBe(1);

			const dup = duplicates[0];
			expect(dup.targetPath).toBe("Note-B");
			expect(dup.elements).toContain("e2");
			expect(dup.elements).toContain("e4");
		});

		it("should return empty if all links are unique", () => {
			const duplicates = findDuplicateLinks(doc);
			expect(duplicates.length).toBe(0);
		});
	});
});
