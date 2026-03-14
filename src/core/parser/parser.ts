import { compress, decompress } from "@core/codec/codec";
import {
	type DrawingEncoding,
	type ElementId,
	type ElementLinkMap,
	ErrorCodes,
	ExcalidrawMcpError,
	type ExcalidrawMdDocument,
	type ExcalidrawScene,
	type FileStat,
	type ParsedSections,
} from "@core/types";

const DRAWING_SEC_COMPRESSED_RE =
	/(\n##? Drawing\n[^`]*(?:```compressed-json\n))([\s\S]*?)(```\n)/;
const DRAWING_SEC_PLAIN_RE =
	/(\n##? Drawing\n[^`]*(?:```json\n))([\s\S]*?)(```\n)/;
const TEXT_ELEMENT_RE = /^(.*?)\s+\^([a-zA-Z0-9_-]+)$/gm;
const ELEMENT_LINK_RE = /^(\[\[.*?\]\])\s+\^([a-zA-Z0-9_-]+)$/gm;

function parseFrontmatter(
	rawFrontmatter: string | null,
): Record<string, unknown> | null {
	if (!rawFrontmatter) {
		return null;
	}

	const body = rawFrontmatter
		.replace(/^---\n/, "")
		.replace(/\n---\n$/, "")
		.trim();

	if (!body) {
		return {};
	}

	const parsed: Record<string, unknown> = {};
	for (const line of body.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) {
			continue;
		}

		const sepIdx = trimmed.indexOf(":");
		if (sepIdx === -1) {
			continue;
		}

		const key = trimmed.slice(0, sepIdx).trim();
		let valueRaw = trimmed.slice(sepIdx + 1).trim();

		if (!key) {
			continue;
		}

		if (
			(valueRaw.startsWith('"') && valueRaw.endsWith('"')) ||
			(valueRaw.startsWith("'") && valueRaw.endsWith("'"))
		) {
			valueRaw = valueRaw.slice(1, -1);
		}

		if (valueRaw === "true" || valueRaw === "false") {
			parsed[key] = valueRaw === "true";
			continue;
		}

		const asNumber = Number(valueRaw);
		if (
			valueRaw !== "" &&
			!Number.isNaN(asNumber) &&
			/^-?\d+(?:\.\d+)?$/.test(valueRaw)
		) {
			parsed[key] = asNumber;
			continue;
		}

		parsed[key] = valueRaw;
	}

	return parsed;
}

// ─── Regex for sections ────────────────────────────────────

/**
 * Splits the raw markdown into parsed sections
 */
export function splitIntoSections(rawMarkdown: string): ParsedSections {
	let frontmatter: string | null = null;
	let headerNotice: string | null = null;
	let textElements: string | null = null;
	let elementLinks: string | null = null;
	let embeddedFiles: string | null = null;
	let drawing: string | null = null;
	let drawingEncoding: DrawingEncoding = "json";

	let remaining = rawMarkdown;

	// 1. Frontmatter
	const fmMatch = remaining.match(/^(---\n[\s\S]*?\n---\n)/);
	if (fmMatch) {
		frontmatter = fmMatch[1];
		remaining = remaining.slice(fmMatch[1].length);
	}

	// 2. Drawing section (extract first, as it's the most reliable marker)
	let drawingPrefix = "";
	let _drawingSuffix = "";
	const compressedMatch = rawMarkdown.match(DRAWING_SEC_COMPRESSED_RE);
	const plainMatch = rawMarkdown.match(DRAWING_SEC_PLAIN_RE);

	if (compressedMatch) {
		drawingEncoding = "compressed-json";
		drawingPrefix = compressedMatch[1];
		drawing = compressedMatch[2];
		_drawingSuffix = compressedMatch[3];
	} else if (plainMatch) {
		drawingEncoding = "json";
		drawingPrefix = plainMatch[1];
		drawing = plainMatch[2];
		_drawingSuffix = plainMatch[3];
	} else {
		throw new ExcalidrawMcpError(
			ErrorCodes.E_PARSE_MISSING_DRAWING_SECTION,
			"Drawing section not found or format unrecognized",
		);
	}

	// Split content before drawing manually to avoid destructive regex
	const drawingStartIndex = rawMarkdown.indexOf(drawingPrefix);
	const contentBeforeDrawing = rawMarkdown.slice(
		frontmatter ? frontmatter.length : 0,
		drawingStartIndex,
	);

	// 3. Extract standard sections up to Drawing
	const excalidrawHeaderIdx = contentBeforeDrawing.indexOf("# Excalidraw Data");
	if (excalidrawHeaderIdx !== -1) {
		headerNotice = contentBeforeDrawing.slice(0, excalidrawHeaderIdx);

		const dataSection = contentBeforeDrawing.slice(excalidrawHeaderIdx);

		// Extract subsections
		const extractSection = (headerRe: RegExp, nextHeaderRe: RegExp) => {
			const match = dataSection.match(headerRe);
			if (!match) return null;
			if (match.index === undefined) return null;

			const startIdx = match.index + match[0].length;
			const nextMatch = dataSection.slice(startIdx).match(nextHeaderRe);
			let endIdx = dataSection.length;

			if (nextMatch && nextMatch.index !== undefined) {
				endIdx = startIdx + nextMatch.index;
			}
			return dataSection.slice(startIdx, endIdx);
		};

		textElements = extractSection(
			/\n## Text Elements\n/,
			/\n## (Element Links|Embedded Files|Drawing)\n/,
		);
		elementLinks = extractSection(
			/\n## Element Links\n/,
			/\n## (Embedded Files|Drawing)\n/,
		);
		embeddedFiles = extractSection(/\n## Embedded Files\n/, /\n## Drawing\n/);
	} else {
		// Edge case if "# Excalidraw Data" is missing but "## Drawing" exists
		headerNotice = contentBeforeDrawing;
	}

	return {
		frontmatter,
		headerNotice,
		textElements,
		elementLinks,
		embeddedFiles,
		drawing,
		drawingEncoding,
	};
}

/**
 * Extract Text Elements map (elementId -> text)
 */
export function extractTextElements(
	textElementsStr: string | null,
): Record<ElementId, string> {
	const result: Record<ElementId, string> = {};
	if (!textElementsStr) return result;

	for (const match of textElementsStr.matchAll(TEXT_ELEMENT_RE)) {
		const text = match[1];
		const elementId = match[2];
		if (text !== undefined && elementId !== undefined) {
			result[elementId] = text;
		}
	}
	return result;
}

/**
 * Extract Element Links map (elementId -> wiki link)
 */
export function extractElementLinks(
	elementLinksStr: string | null,
): ElementLinkMap {
	const result: ElementLinkMap = {};
	if (!elementLinksStr) return result;

	for (const match of elementLinksStr.matchAll(ELEMENT_LINK_RE)) {
		const wikiLink = match[1];
		const elementId = match[2];
		if (wikiLink !== undefined && elementId !== undefined) {
			result[elementId] = wikiLink;
		}
	}
	return result;
}

/**
 * Parse the drawing JSON segment
 */
export function parseDrawing(
	drawingStr: string | null,
	encoding: DrawingEncoding,
): ExcalidrawScene {
	if (!drawingStr) {
		throw new ExcalidrawMcpError(
			ErrorCodes.E_PARSE_INVALID_MD,
			"Drawing data is empty",
		);
	}

	try {
		const jsonStr =
			encoding === "compressed-json" ? decompress(drawingStr) : drawingStr;
		const scene = JSON.parse(jsonStr) as ExcalidrawScene;
		if (scene.type !== "excalidraw") {
			throw new ExcalidrawMcpError(
				ErrorCodes.E_VALIDATE_BROKEN_SCENE,
				"Invalid scene type",
			);
		}
		return scene;
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		throw new ExcalidrawMcpError(
			ErrorCodes.E_PARSE_INVALID_MD,
			`Failed to parse drawing data: ${message}`,
		);
	}
}

/**
 * Parse a full Markdown string to an ExcalidrawMdDocument model
 */
export function parseToDocument(
	rawMarkdown: string,
	filePath: string,
	stat: FileStat,
): ExcalidrawMdDocument {
	const sections = splitIntoSections(rawMarkdown);

	const textElements = extractTextElements(sections.textElements);
	const elementLinks = extractElementLinks(sections.elementLinks);
	const drawing = parseDrawing(sections.drawing, sections.drawingEncoding);

	return {
		path: filePath,
		frontmatter: parseFrontmatter(sections.frontmatter),
		rawFrontmatterText: sections.frontmatter,
		headerNoticeText: sections.headerNotice,
		textElements,
		elementLinks,
		embeddedFiles: sections.embeddedFiles,
		drawing,
		drawingEncoding: sections.drawingEncoding,
		originalText: rawMarkdown,
		fileStat: stat,
	};
}

// ─── Reconstruction ─────────────────────────────────────────

export function rebuildMarkdown(doc: ExcalidrawMdDocument): string {
	let out = "";

	// 1. Frontmatter
	if (doc.rawFrontmatterText) {
		out += doc.rawFrontmatterText;
	}

	// 2. Header notice (content before Excalidraw Data)
	if (doc.headerNoticeText !== null) {
		out += doc.headerNoticeText;
	}

	// Ensure Excalidraw Data header exists if we have elements/links/drawing
	if (!out.includes("# Excalidraw Data")) {
		out += "\n# Excalidraw Data\n";
	}

	// 3. Text Elements
	const textIds = Object.keys(doc.textElements);
	if (textIds.length > 0) {
		out += "\n## Text Elements\n";
		for (const id of textIds) {
			out += `${doc.textElements[id]} ^${id}\n`;
		}
	}

	// 4. Element Links
	const linkIds = Object.keys(doc.elementLinks);
	if (linkIds.length > 0) {
		out += "\n## Element Links\n";
		for (const id of linkIds) {
			out += `${doc.elementLinks[id]} ^${id}\n`;
		}
	}

	// 5. Embedded Files
	if (doc.embeddedFiles?.trim()) {
		out += `\n## Embedded Files\n${doc.embeddedFiles}`;
	}

	// 6. Drawing
	out += "\n## Drawing\n";

	const sceneJson = JSON.stringify(doc.drawing);
	if (doc.drawingEncoding === "compressed-json") {
		out += "```compressed-json\n";
		out += compress(sceneJson);
		out += "\n```\n";
	} else {
		out += "```json\n";
		out += sceneJson;
		out += "\n```\n";
	}

	// The plugin ends with %% to hide the JSON block in preview
	// Make sure we end the file gracefully
	if (!out.endsWith("%%\n") && doc.originalText.endsWith("%%\n")) {
		out += "%%\n";
	} else if (!out.endsWith("\n")) {
		out += "\n";
	}

	return out;
}
