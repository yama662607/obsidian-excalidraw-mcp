import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	extractElementLinks,
	extractTextElements,
	parseDrawing,
	parseToDocument,
	rebuildMarkdown,
	splitIntoSections,
} from "./parser";

const FIXTURES_DIR = join(__dirname, "../../../fixtures");

describe("Excalidraw MD Parser", () => {
	const uncompressedItem = readFileSync(
		join(FIXTURES_DIR, "sample-uncompressed.excalidraw.md"),
		"utf-8",
	);
	const minimalItem = readFileSync(
		join(FIXTURES_DIR, "sample-minimal.excalidraw.md"),
		"utf-8",
	);

	describe("splitIntoSections", () => {
		it("should split uncompressed file correctly", () => {
			const sections = splitIntoSections(uncompressedItem);

			expect(sections.frontmatter).toContain("excalidraw-plugin: parsed");
			expect(sections.headerNotice).toContain(
				"This is the back-of-note content",
			);
			expect(sections.textElements).toContain("Hello World ^text1");
			expect(sections.elementLinks).toContain("[[notes/concept-a]] ^elem1");
			expect(sections.embeddedFiles).toContain("abc123: [[images/photo.png]]");
			expect(sections.drawing).toContain('"type":"excalidraw"');
			expect(sections.drawingEncoding).toBe("json");
		});

		it("should handle minimal file with missing sections", () => {
			const sections = splitIntoSections(minimalItem);

			expect(sections.frontmatter).toContain("excalidraw-plugin: parsed");
			expect(sections.textElements).toContain("Minimal ^textA");
			expect(sections.elementLinks).toBeNull();
			expect(sections.embeddedFiles).toBeNull();
			expect(sections.drawing).toContain('"type":"excalidraw"');
			expect(sections.drawingEncoding).toBe("json");
		});
	});

	describe("extractTextElements", () => {
		it("should extract element IDs and text", () => {
			const sections = splitIntoSections(uncompressedItem);
			const elements = extractTextElements(sections.textElements);

			expect(elements).toHaveProperty("text1", "Hello World");
			expect(elements).toHaveProperty("text2", "This is a concept");
		});

		it("should return empty object for null input", () => {
			const elements = extractTextElements(null);
			expect(elements).toEqual({});
		});
	});

	describe("extractElementLinks", () => {
		it("should extract element IDs and wiki links", () => {
			const sections = splitIntoSections(uncompressedItem);
			const links = extractElementLinks(sections.elementLinks);

			expect(links).toHaveProperty("elem1", "[[notes/concept-a]]");
			expect(links).toHaveProperty("elem2", "[[notes/concept-b|Concept B]]");
		});
	});

	describe("parseDrawing", () => {
		it("should parse plain JSON drawing", () => {
			const sections = splitIntoSections(uncompressedItem);
			const scene = parseDrawing(sections.drawing, sections.drawingEncoding);

			expect(scene.type).toBe("excalidraw");
			expect(scene.elements.length).toBe(5); // rectangle, text, ellipse, text, arrow
		});
	});

	describe("parseToDocument", () => {
		it("should parse frontmatter into structured object", () => {
			const doc = parseToDocument(uncompressedItem, "sample.excalidraw.md", {
				mtimeMs: 1,
				size: uncompressedItem.length,
				sha256: "x".repeat(64),
			});

			expect(doc.frontmatter).toBeTruthy();
			expect(doc.frontmatter?.["excalidraw-plugin"]).toBe("parsed");
		});
	});

	describe("rebuildMarkdown", () => {
		it("should preserve insertion order for text and element links", () => {
			const doc = parseToDocument(uncompressedItem, "sample.excalidraw.md", {
				mtimeMs: 1,
				size: uncompressedItem.length,
				sha256: "x".repeat(64),
			});

			const rebuilt = rebuildMarkdown(doc);
			expect(rebuilt.indexOf("Hello World ^text1")).toBeLessThan(
				rebuilt.indexOf("This is a concept ^text2"),
			);
			expect(rebuilt.indexOf("[[notes/concept-a]] ^elem1")).toBeLessThan(
				rebuilt.indexOf("[[notes/concept-b|Concept B]] ^elem2"),
			);
		});
	});
});
