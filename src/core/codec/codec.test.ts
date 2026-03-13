import { describe, expect, it } from "vitest";
import { compress, decompress, isCompressed } from "./codec";

describe("LZ-String Codec", () => {
	const sampleJson = JSON.stringify({
		type: "excalidraw",
		version: 2,
		elements: [
			{ id: "1", type: "rectangle", x: 10, y: 20 },
			{ id: "2", type: "text", text: "Hello Obsidian" },
		],
	});

	it("should compress and formatting correctly (newlines every 256 chars)", () => {
		// Generate a diverse long string to ensure compressed output is > 256 chars
		const diverseString = Array.from({ length: 5000 }, (_, i) =>
			String.fromCharCode(32 + (i % 95)),
		).join("");
		const compressed = compress(diverseString);

		// Check if there are newlines
		expect(compressed).toContain("\n\n");

		// Check chunk sizes (should be 256 chars + 2 newlines = 258, except for the last chunk)
		const chunks = compressed.split("\n\n");
		for (let i = 0; i < chunks.length - 1; i++) {
			expect(chunks[i].length).toBe(256);
		}
	});

	it("should successfully roundtrip a scene JSON", () => {
		const compressed = compress(sampleJson);
		const decompressed = decompress(compressed);
		expect(decompressed).toBe(sampleJson);
	});

	it("should gracefully fail decompression on invalid data", () => {
		expect(() => decompress("Not a base64 string!!!")).toThrow();
	});

	it("isCompressed should detect compressed-json block", () => {
		const md1 = "## Drawing\n```compressed-json\nOABC\n```";
		const md2 = "## Drawing\n```json\n{}\n```";

		expect(isCompressed(md1)).toBe(true);
		expect(isCompressed(md2)).toBe(false);
	});
});
