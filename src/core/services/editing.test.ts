import {
	type ExcalidrawElement,
	ExcalidrawMcpError,
	type ExcalidrawMdDocument,
	type ExcalidrawScene,
} from "@core/types";
import { beforeEach, describe, expect, it } from "vitest";
import { addEdge, addNode, deleteElements, updateElements } from "./editing";

function getRequiredElement(
	elements: ExcalidrawElement[],
	id: string,
): ExcalidrawElement {
	const element = elements.find((candidate) => candidate.id === id);
	expect(element).toBeDefined();
	if (!element) {
		throw new Error(`Missing element: ${id}`);
	}
	return element;
}

function getBindingElementId(binding: unknown): string | null {
	if (
		typeof binding === "object" &&
		binding !== null &&
		"elementId" in binding &&
		typeof binding.elementId === "string"
	) {
		return binding.elementId;
	}
	return null;
}

function getBoundElementIds(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value
		.filter(
			(item): item is { id: string } =>
				typeof item === "object" &&
				item !== null &&
				"id" in item &&
				typeof item.id === "string",
		)
		.map((item) => item.id);
}

describe("Element Editing Service", () => {
	let doc: ExcalidrawMdDocument;

	beforeEach(() => {
		// Create an empty mock document
		const scene: ExcalidrawScene = {
			type: "excalidraw",
			version: 1,
			elements: [],
		};

		doc = {
			path: "/test.md",
			frontmatter: null,
			rawFrontmatterText: null,
			headerNoticeText: "",
			textElements: {},
			elementLinks: {},
			embeddedFiles: null,
			drawing: scene,
			drawingEncoding: "json",
			originalText: "",
			fileStat: { mtimeMs: 0, size: 0, sha256: "" },
		};
	});

	describe("addNode", () => {
		it("should add a basic shape without text", () => {
			const { doc: newDoc, addedIds } = addNode(doc, {
				type: "rectangle",
				x: 10,
				y: 10,
				width: 50,
				height: 50,
			});
			expect(addedIds.length).toBe(1);

			const el = newDoc.drawing.elements[0];
			expect(el.type).toBe("rectangle");
			expect(el.x).toBe(10);
			expect(el.width).toBe(50);

			// textElements should be empty
			expect(Object.keys(newDoc.textElements).length).toBe(0);
		});

		it("should add a shape with bound text", () => {
			const { doc: newDoc, addedIds } = addNode(doc, {
				type: "rectangle",
				x: 10,
				y: 10,
				text: "My Node",
			});

			// Should create both rectangle and text element
			expect(addedIds.length).toBe(2);
			expect(newDoc.drawing.elements.length).toBe(2);

			const rect = newDoc.drawing.elements.find((e) => e.type === "rectangle");
			const text = newDoc.drawing.elements.find((e) => e.type === "text");

			expect(rect).toBeDefined();
			expect(text).toBeDefined();
			expect(text?.containerId).toBe(rect?.id);
			const rectBoundIds = getBoundElementIds(rect?.boundElements);
			const textId = text?.id;
			expect(textId).toBeDefined();
			if (!textId) {
				throw new Error("Missing text element id");
			}
			expect(rectBoundIds[0]).toBe(textId);

			// Should populate textElements dict
			expect(newDoc.textElements[textId]).toBe("My Node");
		});

		it("should add a standalone text node", () => {
			const { doc: newDoc, addedIds } = addNode(doc, {
				type: "text",
				x: 10,
				y: 10,
				text: "Just Text",
			});
			expect(addedIds.length).toBe(1);

			const text = newDoc.drawing.elements[0];
			expect(text.type).toBe("text");
			expect(text.text).toBe("Just Text");
			expect(newDoc.textElements[text.id]).toBe("Just Text");
		});
	});

	describe("addEdge", () => {
		it("should link two existing nodes", () => {
			// 1. Setup two nodes
			let curr = addNode(doc, {
				type: "rectangle",
				x: 0,
				y: 0,
				width: 50,
				height: 50,
			});
			const n1Id = curr.addedIds[0];

			curr = addNode(curr.doc, {
				type: "rectangle",
				x: 100,
				y: 100,
				width: 50,
				height: 50,
			});
			const n2Id = curr.addedIds[0];

			// 2. Add edge
			const { doc: linkedDoc, addedIds } = addEdge(curr.doc, {
				startId: n1Id,
				endId: n2Id,
			});
			expect(addedIds.length).toBe(1);
			const edgeId = addedIds[0];

			const edge = getRequiredElement(linkedDoc.drawing.elements, edgeId);
			expect(edge.type).toBe("arrow");
			expect(getBindingElementId(edge.startBinding)).toBe(n1Id);
			expect(getBindingElementId(edge.endBinding)).toBe(n2Id);

			const r1 = getRequiredElement(linkedDoc.drawing.elements, n1Id);
			expect(getBoundElementIds(r1.boundElements)).toContain(edgeId);
		});

		it("should throw if node does not exist", () => {
			expect(() => addEdge(doc, { startId: "foo", endId: "bar" })).toThrowError(
				ExcalidrawMcpError,
			);
		});
	});

	describe("updateElements", () => {
		it("should update specified properties and sync text", () => {
			const { doc: d1, addedIds } = addNode(doc, {
				type: "text",
				x: 10,
				y: 10,
				text: "Old Text",
			});
			const textId = addedIds[0];

			const d2 = updateElements(d1, [{ id: textId, x: 20, text: "New Text" }]);

			const el = d2.drawing.elements[0];
			expect(el.x).toBe(20);
			expect(el.text).toBe("New Text");
			expect(d2.textElements[textId]).toBe("New Text");
			expect(el.updated).toBeGreaterThan(0);
		});
	});

	describe("deleteElements", () => {
		it("should delete nodes and bounded elements, and remove dangling edges", () => {
			// Setup: n1[with text] ----> n2
			let curr = addNode(doc, { type: "rectangle", x: 0, y: 0, text: "Box1" });
			const n1Id = curr.addedIds[0]; // rectangle

			curr = addNode(curr.doc, { type: "rectangle", x: 100, y: 100 });
			const n2Id = curr.addedIds[0];

			curr = addEdge(curr.doc, { startId: n1Id, endId: n2Id });
			const edgeId = curr.addedIds[0];

			const testDoc = curr.doc;
			expect(testDoc.drawing.elements.length).toBe(4); // rect1, text1, rect2, edge

			// Action: delete n1
			const deletedDoc = deleteElements(testDoc, [n1Id]);

			// Assertions
			// It should delete n1 and n1's text, and remove the now-dangling edge.
			expect(deletedDoc.drawing.elements.length).toBe(1);
			expect(
				deletedDoc.drawing.elements.find((el) => el.id === edgeId),
			).toBeUndefined();
			expect(deletedDoc.drawing.elements[0].id).toBe(n2Id);

			// Text dictionary should be cleaned up
			expect(Object.keys(deletedDoc.textElements).length).toBe(0);
		});
	});
});
