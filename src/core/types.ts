/**
 * Core type definitions for the Obsidian Excalidraw MCP.
 */

// ─── Element ID ────────────────────────────────────────────
export type ElementId = string;

// ─── Wiki Link ─────────────────────────────────────────────
export type WikiLink = string;

export type ParsedWikiLink = {
	raw: string;
	targetPath: string;
	alias?: string;
	subpath?: string;
};

// ─── Element Link Map ──────────────────────────────────────
export type ElementLinkMap = Record<ElementId, WikiLink>;

// ─── Drawing Encoding ──────────────────────────────────────
export type DrawingEncoding = "compressed-json" | "json";

// ─── File Stat ─────────────────────────────────────────────
export type FileStat = {
	mtimeMs: number;
	size: number;
	sha256: string;
};

// ─── Excalidraw Scene ──────────────────────────────────────
export type ExcalidrawElement = {
	id: string;
	type: string;
	x: number;
	y: number;
	width: number;
	height: number;
	[key: string]: unknown;
};

export type ExcalidrawScene = {
	type: "excalidraw";
	version: number;
	source?: string;
	elements: ExcalidrawElement[];
	appState?: Record<string, unknown>;
	files?: Record<string, unknown>;
	[key: string]: unknown;
};

// ─── Excalidraw MD Document ────────────────────────────────
export type ExcalidrawMdDocument = {
	path: string;
	frontmatter: Record<string, unknown> | null;
	rawFrontmatterText: string | null;
	headerNoticeText: string | null;
	textElements: Record<ElementId, string>;
	elementLinks: ElementLinkMap;
	embeddedFiles: string | null;
	drawing: ExcalidrawScene;
	drawingEncoding: DrawingEncoding;
	originalText: string;
	fileStat: FileStat;
};

// ─── Parsed Sections ───────────────────────────────────────
export type ParsedSections = {
	frontmatter: string | null;
	headerNotice: string | null;
	textElements: string | null;
	elementLinks: string | null;
	embeddedFiles: string | null;
	drawing: string | null;
	drawingEncoding: DrawingEncoding;
};

// ─── Error Codes ───────────────────────────────────────────
export const ErrorCodes = {
	E_PARSE_INVALID_MD: "E_PARSE_INVALID_MD",
	E_PARSE_MISSING_DRAWING_SECTION: "E_PARSE_MISSING_DRAWING_SECTION",
	E_CODEC_UNSUPPORTED_ENCODING: "E_CODEC_UNSUPPORTED_ENCODING",
	E_CODEC_DECOMPRESS_FAILED: "E_CODEC_DECOMPRESS_FAILED",
	E_VALIDATE_BROKEN_SCENE: "E_VALIDATE_BROKEN_SCENE",
	E_VALIDATE_DUPLICATE_IDS: "E_VALIDATE_DUPLICATE_IDS",
	E_CONFLICT_MODIFIED: "E_CONFLICT_MODIFIED",
	E_NOT_FOUND_ELEMENT: "E_NOT_FOUND_ELEMENT",
	E_NOT_FOUND_NOTE: "E_NOT_FOUND_NOTE",
	E_LINK_INVALID_WIKILINK: "E_LINK_INVALID_WIKILINK",
	E_STORAGE_WRITE_FAILED: "E_STORAGE_WRITE_FAILED",
	E_STORAGE_PATH_OUTSIDE_VAULT: "E_STORAGE_PATH_OUTSIDE_VAULT",
	E_OPERATION_UNSUPPORTED: "E_OPERATION_UNSUPPORTED",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export class ExcalidrawMcpError extends Error {
	constructor(
		public readonly code: ErrorCode,
		message: string,
		public readonly details?: Record<string, unknown>,
	) {
		super(message);
		this.name = "ExcalidrawMcpError";
	}
}
