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
	pathUpdates: Record<string, string>,
): {
	doc: ExcalidrawMdDocument;
	repairs: Array<{ elementId: ElementId; oldLink: string; newLink: string }>;
} {
	let hasChanges = false;
	const elementLinks = { ...doc.elementLinks };
	let elements = [...doc.drawing.elements];
	const repairs: Array<{
		elementId: ElementId;
		oldLink: string;
		newLink: string;
	}> = [];

	for (const [id, rawLink] of Object.entries(elementLinks)) {
		try {
			const parsed = parseWikiLink(rawLink);

			// If the target path is in the update map, rewrite it
			if (pathUpdates[parsed.targetPath]) {
				const newPath = pathUpdates[parsed.targetPath];
				const newLink = buildWikiLink(newPath, parsed.alias, parsed.subpath);

				elementLinks[id] = newLink;
				hasChanges = true;
				repairs.push({ elementId: id, oldLink: rawLink, newLink });

				// Update the drawing scene element's internal link property too
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
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
		} catch (_e: unknown) {
			// Ignore invalid links during repair phase
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
