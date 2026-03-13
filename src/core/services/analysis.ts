import { parseWikiLink } from "@core/model/links";
import type {
	ElementId,
	ExcalidrawElement,
	ExcalidrawMdDocument,
} from "@core/types";

type BoundElementRef = { id: string; type: string };

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

function getBoundElements(value: unknown): BoundElementRef[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.filter(
		(item): item is BoundElementRef =>
			typeof item === "object" &&
			item !== null &&
			"id" in item &&
			"type" in item &&
			typeof item.id === "string" &&
			typeof item.type === "string",
	);
}

export type DirectedEdge = {
	edgeId: ElementId;
	fromId: ElementId;
	toId: ElementId;
	label?: string; // Text inside the edge if it exists
};

export type GraphStructure = {
	nodes: ExcalidrawElement[];
	edges: DirectedEdge[];
};

/**
 * Extracts a normalized graph structure (nodes and directed edges)
 * from the Excalidraw drawing scene.
 */
export function extractGraph(doc: ExcalidrawMdDocument): GraphStructure {
	const elements = doc.drawing.elements;

	const nodes = elements.filter(
		(el) => el.type !== "arrow" && el.type !== "line" && !el.isDeleted,
	);

	const arrows = elements.filter(
		(el) => (el.type === "arrow" || el.type === "line") && !el.isDeleted,
	);

	const edges: DirectedEdge[] = [];

	for (const arrow of arrows) {
		// Check if the arrow is bound to both a start and an end element
		if (arrow.startBinding && arrow.endBinding) {
			const fromId = getBindingElementId(arrow.startBinding);
			const toId = getBindingElementId(arrow.endBinding);
			if (!fromId || !toId) {
				continue;
			}

			// Look for a bound text label
			let label: string | undefined;
			const boundTexts = getBoundElements(arrow.boundElements).filter(
				(bound) => bound.type === "text",
			);
			if (boundTexts.length > 0) {
				const textNodeId = boundTexts[0].id;
				label = doc.textElements[textNodeId];
			}

			edges.push({
				edgeId: arrow.id,
				fromId,
				toId,
				label,
			});
		}
	}

	return { nodes, edges };
}

/**
 * Finds all elements that have visual content but lack a markdown wiki link.
 * Useful for prompting users to connect their visual thoughts to knowledge base notes.
 */
export function findUnlinkedElements(
	doc: ExcalidrawMdDocument,
): ExcalidrawElement[] {
	return doc.drawing.elements.filter((el) => {
		if (el.isDeleted) return false;
		// Skip edges and purely presentational elements unless they have text bounds
		if (el.type === "arrow" || el.type === "line") return false;
		if (el.type === "freedraw") return false;

		// Check if it's already linked
		if (doc.elementLinks[el.id] || el.link) return false;

		// We consider it "unlinked" (worth linking) if it has text or is a container with text
		if (el.type === "text" && el.text) return true;

		// Check if a shape has text bound to it
		if (el.boundElements) {
			const hasText = getBoundElements(el.boundElements).some(
				(bound) => bound.type === "text",
			);
			if (hasText) return true;
		}

		return false;
	});
}

export type DuplicateTarget = {
	targetPath: string;
	elements: ElementId[];
};

/**
 * Detects if multiple elements in the drawing link to the exact same target path.
 * This can indicate scattered thoughts about the same topic.
 */
export function findDuplicateLinks(
	doc: ExcalidrawMdDocument,
): DuplicateTarget[] {
	// Mapping of normalized targetPath -> array of element IDs
	const targetMap: Record<string, ElementId[]> = {};

	for (const [id, rawLink] of Object.entries(doc.elementLinks)) {
		try {
			const parsed = parseWikiLink(rawLink);
			const normalizedPath = parsed.targetPath; // Note: 'folder/Note.md' and 'Note.md' might be the same in Obsidian,
			// but we can only do exact string matching here without vault-level indexing.

			if (!targetMap[normalizedPath]) {
				targetMap[normalizedPath] = [];
			}
			targetMap[normalizedPath].push(id);
		} catch (_e) {
			// Ignore invalid links
		}
	}

	const duplicates: DuplicateTarget[] = [];
	for (const [targetPath, elements] of Object.entries(targetMap)) {
		if (elements.length > 1) {
			duplicates.push({ targetPath, elements });
		}
	}

	return duplicates;
}
