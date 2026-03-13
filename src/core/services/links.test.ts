import {
	ExcalidrawMcpError,
	type ExcalidrawMdDocument,
	type ExcalidrawScene,
} from "@core/types";
import { beforeEach, describe, expect, it } from "vitest";
import { removeElementLink, repairElementLinks, setElementLink } from "./links";

describe("Element Links Service", () => {
	let doc: ExcalidrawMdDocument;

	beforeEach(() => {
		// Basic mock doc with one element
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
				},
			],
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

	describe("setElementLink", () => {
		it("should set a link and sync to drawing elements", () => {
			const newDoc = setElementLink(doc, "e1", "[[My Target]]");

			// Should add to elementLinks
			expect(newDoc.elementLinks.e1).toBe("[[My Target]]");

			// Should sync inner property
			const el = newDoc.drawing.elements.find((e) => e.id === "e1");
			expect(el).toBeDefined();
			if (!el) {
				throw new Error("Missing element e1");
			}
			expect(el.link).toBe("[[My Target]]");
			expect(el.updated).toBeGreaterThan(0);
		});

		it("should fail if element does not exist", () => {
			expect(() => setElementLink(doc, "missing", "[[Target]]")).toThrowError(
				ExcalidrawMcpError,
			);
		});

		it("should fail if link format is invalid", () => {
			expect(() => setElementLink(doc, "e1", "Not a link")).toThrowError(
				ExcalidrawMcpError,
			);
		});
	});

	describe("removeElementLink", () => {
		it("should remove link and sync internals", () => {
			const docWithLink = setElementLink(doc, "e1", "[[Target]]");
			const removedDoc = removeElementLink(docWithLink, "e1");

			expect(removedDoc.elementLinks.e1).toBeUndefined();

			const el = removedDoc.drawing.elements.find((e) => e.id === "e1");
			expect(el).toBeDefined();
			if (!el) {
				throw new Error("Missing element e1");
			}
			expect(el.link).toBeNull();
		});

		it("should fail if element does not exist", () => {
			expect(() => removeElementLink(doc, "missing")).toThrowError(
				ExcalidrawMcpError,
			);
		});

		it("should do nothing if link does not exist but element does", () => {
			const noChange = removeElementLink(doc, "e1");
			expect(noChange).toEqual(doc); // reference equality or structural equality
		});
	});

	describe("repairElementLinks", () => {
		it("should fix broken links using a map", () => {
			// e1 -> old/path, e2 -> standard/path
			const d1 = setElementLink(doc, "e1", "[[old/path|Alias]]");

			// manually add e2 for test
			const sceneWithE2 = {
				...d1.drawing,
				elements: [
					...d1.drawing.elements,
					{
						id: "e2",
						type: "text",
						x: 0,
						y: 0,
						width: 10,
						height: 10,
						groupIds: [],
						link: "[[standard/path]]",
					},
				],
			};
			const d2 = {
				...d1,
				drawing: sceneWithE2,
				elementLinks: { ...d1.elementLinks, e2: "[[standard/path]]" },
			};

			// Map: old/path -> new/brand/new_path
			const { doc: repaired, repairs } = repairElementLinks(d2, {
				"old/path": "new/brand/new_path",
			});

			expect(repairs.length).toBe(1);
			expect(repairs[0].elementId).toBe("e1");

			expect(repaired.elementLinks.e1).toBe("[[new/brand/new_path|Alias]]"); // Preserves alias
			expect(repaired.elementLinks.e2).toBe("[[standard/path]]"); // Unaffected

			const e1 = repaired.drawing.elements.find((e) => e.id === "e1");
			expect(e1).toBeDefined();
			if (!e1) {
				throw new Error("Missing element e1");
			}
			expect(e1.link).toBe("[[new/brand/new_path|Alias]]");
		});
	});
});
