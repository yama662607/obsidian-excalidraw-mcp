import { buildWikiLink, parseWikiLink } from "@core/model/links";
import {
	type ElementId,
	ErrorCodes,
	ExcalidrawMcpError,
	type ExcalidrawMdDocument,
	type WikiLink,
} from "@core/types";

/**
 * Validates if an element exists in the drawing to attach a link to it.
 */
function ensureElementExists(doc: ExcalidrawMdDocument, id: ElementId): void {
	const exists = doc.drawing.elements.some((e) => e.id === id);
	if (!exists) {
		throw new ExcalidrawMcpError(
			ErrorCodes.E_NOT_FOUND_ELEMENT,
			`Element missing: Cannot attach a link to missing element ID ${id}`,
		);
	}
}

/**
 * Sets or updates a wiki link pointing from an element to a target markdown file.
 * Returns a new document with updated references.
 */
export function setElementLink(
	doc: ExcalidrawMdDocument,
	elementId: ElementId,
	wikiLink: WikiLink,
): ExcalidrawMdDocument {
	ensureElementExists(doc, elementId);
	parseWikiLink(wikiLink); // Will throw E_LINK_INVALID_WIKILINK if invalid format

	const newDoc: ExcalidrawMdDocument = {
		...doc,
		elementLinks: {
			...doc.elementLinks,
			[elementId]: wikiLink,
		},
		drawing: {
			...doc.drawing,
			elements: doc.drawing.elements.map((el) => {
				if (el.id === elementId) {
					// Excalidraw uses the `link` property internally for basic links
					// Even if we store it in elementLinks, we should sync it into the drawing payload
					// to make it robust across standard excalidraw clients as well.
					return {
						...el,
						link: wikiLink,
						updated: Date.now(),
						version: ((el.version as number) || 1) + 1,
					};
				}
				return el;
			}),
		},
	};

	return newDoc;
}

/**
 * Removes a link from an element.
 */
export function removeElementLink(
	doc: ExcalidrawMdDocument,
	elementId: ElementId,
): ExcalidrawMdDocument {
	ensureElementExists(doc, elementId);

	if (!doc.elementLinks[elementId]) {
		return doc; // No change needed
	}

	const elementLinks = { ...doc.elementLinks };
	delete elementLinks[elementId];

	return {
		...doc,
		elementLinks,
		drawing: {
			...doc.drawing,
			elements: doc.drawing.elements.map((el) => {
				if (el.id === elementId && el.link) {
					return {
						...el,
						link: null,
						updated: Date.now(),
						version: ((el.version as number) || 1) + 1,
					};
				}
				return el;
			}),
		},
	};
}

/**
 * Find and repair broken links using a map of old -> new paths.
 * Useful when files have been moved globally.
 */
export function repairElementLinks(
	doc: ExcalidrawMdDocument,
	pathUpdates: Record<string, string> = {},
): {
	doc: ExcalidrawMdDocument;
	repairs: Array<{
		elementId: ElementId;
		action: "updated" | "removed";
		oldLink: string;
		newLink: string | null;
	}>;
} {
	let hasChanges = false;
	const elementLinks = { ...doc.elementLinks };
	let elements = [...doc.drawing.elements];
	const existingElementIds = new Set(elements.map((el) => el.id));
	const repairs: Array<{
		elementId: ElementId;
		action: "updated" | "removed";
		oldLink: string;
		newLink: string | null;
	}> = [];

	const normalizeTargetPath = (targetPath: string): string => {
		let next = targetPath.trim().replace(/\\/g, "/").replace(/^\.\//, "");
		next = next.replace(/\/+/g, "/");
		next = next.replace(/\.md$/i, "");
		return next;
	};

	for (const [id, rawLink] of Object.entries(elementLinks)) {
		if (!existingElementIds.has(id)) {
			delete elementLinks[id];
			hasChanges = true;
			repairs.push({
				elementId: id,
				action: "removed",
				oldLink: rawLink,
				newLink: null,
			});
			continue;
		}

		try {
			const parsed = parseWikiLink(rawLink);
			const normalizedPath = normalizeTargetPath(parsed.targetPath);
			const rewrittenPath = pathUpdates[normalizedPath] || normalizedPath;
			const newLink = buildWikiLink(
				rewrittenPath,
				parsed.alias,
				parsed.subpath,
			);

			if (newLink !== rawLink) {
				elementLinks[id] = newLink;
				hasChanges = true;
				repairs.push({
					elementId: id,
					action: "updated",
					oldLink: rawLink,
					newLink,
				});

				elements = elements.map((el) => {
					if (el.id === id) {
						return {
							...el,
							link: newLink,
							updated: Date.now(),
							version: ((el.version as number) || 1) + 1,
						};
					}
					return el;
				});
			}
		} catch (_e: unknown) {
			delete elementLinks[id];
			hasChanges = true;
			repairs.push({
				elementId: id,
				action: "removed",
				oldLink: rawLink,
				newLink: null,
			});
		}
	}

	if (!hasChanges) {
		return { doc, repairs: [] };
	}

	return {
		doc: {
			...doc,
			elementLinks,
			drawing: {
				...doc.drawing,
				elements,
			},
		},
		repairs,
	};
}

/**
 * Creates a note from an element's text content.
 * Returns the note content and the updated document with the element linked to the new note.
 */
export function createNoteFromElement(
	doc: ExcalidrawMdDocument,
	elementId: ElementId,
	notePath: string,
): { doc: ExcalidrawMdDocument; noteContent: string } {
	ensureElementExists(doc, elementId);

	// Get the element's text content
	const elementText = doc.textElements[elementId];
	const element = doc.drawing.elements.find((e) => e.id === elementId);

	if (!elementText && !element?.text) {
		throw new ExcalidrawMcpError(
			ErrorCodes.E_OPERATION_UNSUPPORTED,
			`Element ${elementId} has no text content to create a note from.`,
		);
	}

	const textContent = elementText || element?.text || "";

	// Create a simple template for the new note
	const timestamp = new Date().toISOString();
	const noteContent = `---
created: ${timestamp}
source: Excalidraw element ${elementId}
---

# ${textContent}

`;

	// Build the wiki link and attach it to the element
	const wikiLink = `[[${notePath}]]`;
	const updatedDoc = setElementLink(doc, elementId, wikiLink);

	return { doc: updatedDoc, noteContent };
}
