/**
 * LZ-String compression codec for .excalidraw.md Drawing sections.
 *
 * Uses LZString.compressToBase64 / decompressFromBase64, matching
 * the Obsidian Excalidraw plugin's implementation.
 */
import LZString from "lz-string";

const CHUNK_SIZE = 256;

/**
 * Compress a JSON string using LZ-String Base64 encoding.
 * Inserts newlines every 256 characters to match the plugin's format.
 */
export function compress(data: string): string {
	const compressed = LZString.compressToBase64(data);
	let result = "";
	for (let i = 0; i < compressed.length; i += CHUNK_SIZE) {
		result += `${compressed.slice(i, i + CHUNK_SIZE)}\n\n`;
	}
	return result.trim();
}

/**
 * Decompress an LZ-String Base64 encoded string.
 * Strips all newline characters before decompression.
 */
export function decompress(data: string): string {
	let cleaned = "";
	for (let i = 0; i < data.length; i++) {
		const char = data[i];
		if (char !== "\n" && char !== "\r") {
			cleaned += char;
		}
	}
	const result = LZString.decompressFromBase64(cleaned);
	if (result === null || result === "") {
		throw new Error("Decompression failed: invalid or empty data");
	}
	return result;
}

/**
 * Check if a markdown string contains a compressed-json Drawing block.
 */
export function isCompressed(data: string): boolean {
	return /```compressed-json\n/m.test(data);
}
