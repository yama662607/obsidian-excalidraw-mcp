describe("rebuildMarkdown", () => {
	it("should rebuild identical markdown from parsed document (roundtrip)", () => {
		// Create a mock stat
		const stat = { mtimeMs: 0, size: uncompressedItem.length, sha256: "" };

		const doc = parseToDocument(uncompressedItem, "/test.excalidraw.md", stat);
		const rebuilt = rebuildMarkdown(doc);

		// Compare the lengths first to get a quick check
		expect(rebuilt.length).toBeCloseTo(uncompressedItem.length, -1);

		// The drawing section JSON gets re-stringified, so it might not be byte-identical
		// if there were spaces in the original JSON, but it should be structurally identical
		const rebuiltDoc = parseToDocument(rebuilt, "/test.excalidraw.md", stat);
		expect(rebuiltDoc.drawing).toEqual(doc.drawing);
		expect(rebuiltDoc.textElements).toEqual(doc.textElements);
		expect(rebuiltDoc.elementLinks).toEqual(doc.elementLinks);

		// Also test with minimal file
		const minimalDoc = parseToDocument(minimalItem, "/min.excalidraw.md", stat);
		const rebuiltMinimal = rebuildMarkdown(minimalDoc);
		const rebuiltMinimalDoc = parseToDocument(
			rebuiltMinimal,
			"/min.excalidraw.md",
			stat,
		);
		expect(rebuiltMinimalDoc.drawing).toEqual(minimalDoc.drawing);
	});

	it("should successfully roundtrip compressed json", () => {
		const stat = { mtimeMs: 0, size: 0, sha256: "" };
		const doc = parseToDocument(minimalItem, "/min.excalidraw.md", stat);

		// Force it to save as compressed
		doc.drawingEncoding = "compressed-json";
		const rebuilt = rebuildMarkdown(doc);

		const rebuiltDoc = parseToDocument(rebuilt, "/min.excalidraw.md", stat);

		expect(rebuiltDoc.drawingEncoding).toBe("compressed-json");
		expect(rebuiltDoc.drawing).toEqual(doc.drawing);
	});
});
