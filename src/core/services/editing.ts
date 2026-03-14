import {
	type ElementId,
	ErrorCodes,
	type ExcalidrawElement,
	ExcalidrawMcpError,
	type ExcalidrawMdDocument,
} from "@core/types";

type BoundElementRef = { id: string; type: string };

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

// Random ID generator matching Excalidraw's nanoid style (simplistic version for the server)
function generateId(): string {
	const chars =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
	let id = "";
	for (let i = 0; i < 21; i++) {
		id += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return id;
}

// Generate base element properties
function createBaseElement(
	type: string,
	x: number,
	y: number,
): ExcalidrawElement {
	return {
		id: generateId(),
		type,
		x,
		y,
		width: 100,
		height: 100,
		angle: 0,
		strokeColor: "#1e1e1e",
		backgroundColor: "transparent",
		fillStyle: "solid",
		strokeWidth: 2,
		strokeStyle: "solid",
		roughness: 1,
		opacity: 100,
		groupIds: [],
		frameId: null,
		roundness: null,
		seed: Math.floor(Math.random() * 2 ** 31),
		version: 1,
		versionNonce: Math.floor(Math.random() * 2 ** 31),
		isDeleted: false,
		boundElements: null,
		updated: Date.now(),
		link: null,
		locked: false,
	};
}

export type AddNodeOptions = {
	type: "rectangle" | "ellipse" | "diamond" | "text" | "frame";
	x: number;
	y: number;
	width?: number;
	height?: number;
	text?: string;
	frameId?: ElementId;
};

/**
 * Adds a new node to the document's drawing scene.
 * If text is provided for a non-text shape, a bound text element is also created.
 */
export function addNode(
	doc: ExcalidrawMdDocument,
	options: AddNodeOptions,
): { doc: ExcalidrawMdDocument; addedIds: ElementId[] } {
	const elements = [...doc.drawing.elements];
	const addedIds: ElementId[] = [];

	const mainElement = createBaseElement(options.type, options.x, options.y);
	if (options.width !== undefined) mainElement.width = options.width;
	if (options.height !== undefined) mainElement.height = options.height;
	if (options.frameId) mainElement.frameId = options.frameId;

	// Handle specific shape defaults
	if (options.type === "diamond") {
		mainElement.roundness = { type: 2 }; // Default roundness for diamond in Excalidraw
	} else if (options.type === "text") {
		const nodeText = options.text || "Text";
		mainElement.text = nodeText;
		mainElement.fontSize = 20;
		mainElement.fontFamily = 1; // Virgil
		mainElement.textAlign = "left";
		mainElement.verticalAlign = "top";
		mainElement.width = nodeText.length * 10; // rough guess
		mainElement.height = 25;
	}

	elements.push(mainElement);
	addedIds.push(mainElement.id);

	// If a non-text shape was requested WITH text, bind a text element to it
	let textNodeId: string | null = null;
	if (options.type !== "text" && options.text) {
		const textElement = createBaseElement(
			"text",
			options.x + 10,
			options.y + 10,
		);
		textElement.text = options.text;
		textElement.fontSize = 20;
		textElement.fontFamily = 1;
		textElement.textAlign = "center";
		textElement.verticalAlign = "middle";
		textElement.containerId = mainElement.id;
		textElement.width = options.width ? options.width - 20 : 80;
		textElement.height = 25;

		// Bind to parent
		mainElement.boundElements = [{ id: textElement.id, type: "text" }];

		elements.push(textElement);
		addedIds.push(textElement.id);
		textNodeId = textElement.id;
	}

	// Generate new doc object (immutable approach)
	const newDoc: ExcalidrawMdDocument = {
		...doc,
		drawing: {
			...doc.drawing,
			elements,
		},
		// If text was added, update the `## Text Elements` section as well to maintain plugin consistency
		textElements: {
			...doc.textElements,
		},
	};

	if (options.type === "text" && mainElement.text) {
		newDoc.textElements[mainElement.id] = mainElement.text as string;
	} else if (textNodeId && options.text) {
		newDoc.textElements[textNodeId] = options.text;
	}

	return { doc: newDoc, addedIds };
}

export type AddEdgeOptions = {
	type?: "arrow" | "line";
	startId: ElementId;
	endId: ElementId;
	text?: string;
};

/**
 * Adds an edge (arrow or line) between two existing elements.
 */
export function addEdge(
	doc: ExcalidrawMdDocument,
	options: AddEdgeOptions,
): { doc: ExcalidrawMdDocument; addedIds: ElementId[] } {
	const elements = [...doc.drawing.elements];
	const addedIds: ElementId[] = [];

	const startEl = elements.find((e) => e.id === options.startId);
	const endEl = elements.find((e) => e.id === options.endId);

	if (!startEl || !endEl) {
		throw new ExcalidrawMcpError(
			ErrorCodes.E_NOT_FOUND_ELEMENT,
			`Cannot create edge: startId or endId not found in the scene.`,
		);
	}

	const startX = startEl.x + Math.floor(startEl.width / 2);
	const startY = startEl.y + Math.floor(startEl.height / 2);
	const endX = endEl.x + Math.floor(endEl.width / 2);
	const endY = endEl.y + Math.floor(endEl.height / 2);

	const edge = createBaseElement(options.type || "arrow", startX, startY);
	edge.width = Math.abs(endX - startX);
	edge.height = Math.abs(endY - startY);

	// Coordinates for points are relative to the top-left (x, y)
	// We just set a straight line for now. Excalidraw's engine will recalculate it on load if needed.
	edge.points = [
		[0, 0],
		[endX - startX, endY - startY],
	];

	edge.startBinding = { elementId: options.startId, focus: 0, gap: 1 };
	edge.endBinding = { elementId: options.endId, focus: 0, gap: 1 };

	if (options.type !== "line") {
		edge.endArrowhead = "arrow";
	}

	elements.push(edge);
	addedIds.push(edge.id);

	// Bind the edge to the nodes (update nodes as well)
	const newElements = elements.map((el) => {
		if (el.id === options.startId || el.id === options.endId) {
			const existingBounds = getBoundElements(el.boundElements);
			return {
				...el,
				boundElements: [...existingBounds, { id: edge.id, type: edge.type }],
			};
		}
		return el;
	});

	// Optional: add text to the edge (label)
	let textNodeId: string | null = null;
	if (options.text) {
		const midX = startX + (endX - startX) / 2;
		const midY = startY + (endY - startY) / 2;
		const textElement = createBaseElement("text", midX, midY);
		textElement.text = options.text;
		textElement.fontSize = 20;
		textElement.fontFamily = 1;
		textElement.textAlign = "center";
		textElement.verticalAlign = "middle";
		textElement.containerId = edge.id;

		// Bind to parent edge
		edge.boundElements = [{ id: textElement.id, type: "text" }];

		newElements.push(textElement);
		addedIds.push(textElement.id);
		textNodeId = textElement.id;
	}

	const newDoc: ExcalidrawMdDocument = {
		...doc,
		drawing: {
			...doc.drawing,
			elements: newElements,
		},
		textElements: {
			...doc.textElements,
		},
	};

	if (textNodeId && options.text) {
		newDoc.textElements[textNodeId] = options.text;
	}

	return { doc: newDoc, addedIds };
}

export type ElementUpdatePatch = {
	id: ElementId;
	[key: string]: unknown;
};

/**
 * Updates properties of existing elements.
 */
export function updateElements(
	doc: ExcalidrawMdDocument,
	patches: ElementUpdatePatch[],
): ExcalidrawMdDocument {
	const newElements = doc.drawing.elements.map((el) => {
		const patch = patches.find((p) => p.id === el.id);
		if (patch) {
			// Remove 'id' from patch to ensure we don't change the element ID
			const { id, ...updates } = patch;
			return {
				...el,
				...updates,
				updated: Date.now(),
				version: ((el.version as number) || 1) + 1,
			};
		}
		return el;
	});

	const newDoc: ExcalidrawMdDocument = {
		...doc,
		drawing: {
			...doc.drawing,
			elements: newElements,
		},
		textElements: {
			...doc.textElements,
		},
	};

	// Sync textElements if text property was patched
	patches.forEach((patch) => {
		if (
			patch.text &&
			typeof patch.text === "string" &&
			newDoc.textElements[patch.id] !== undefined
		) {
			newDoc.textElements[patch.id] = patch.text;
		}
	});

	return newDoc;
}

/**
 * Deletes elements by IDs and cleans up dangling references (links and bounds).
 */
export function deleteElements(
	doc: ExcalidrawMdDocument,
	ids: ElementId[],
): ExcalidrawMdDocument {
	const idSet = new Set(ids);
	const originalBindingState = new Map<
		string,
		{ startId: string | null; endId: string | null }
	>();

	for (const el of doc.drawing.elements) {
		originalBindingState.set(el.id, {
			startId: getBindingElementId(el.startBinding),
			endId: getBindingElementId(el.endBinding),
		});
	}

	// Also collect text nodes bound to deleted containers
	const containersToDelete = doc.drawing.elements.filter((el) =>
		idSet.has(el.id),
	);
	const textIdsToDelete = containersToDelete.flatMap((el) =>
		getBoundElements(el.boundElements)
			.filter((bound) => bound.type === "text")
			.map((bound) => bound.id),
	);

	textIdsToDelete.forEach((id) => {
		idSet.add(id);
	});

	const newElements = doc.drawing.elements
		// 1. Remove the elements themselves
		.filter((el) => !idSet.has(el.id))
		// 2. Clean up bindings in remaining elements
		.map((el) => {
			let isChanged = false;
			const newEl = { ...el };

			if (newEl.boundElements) {
				const currentBounds = getBoundElements(newEl.boundElements);
				const filteredBounds = currentBounds.filter(
					(bound) => !idSet.has(bound.id),
				);
				if (filteredBounds.length !== currentBounds.length) {
					newEl.boundElements =
						filteredBounds.length > 0 ? filteredBounds : null;
					isChanged = true;
				}
			}

			// Check arrow bindings
			const startBindingId = getBindingElementId(newEl.startBinding);
			if (startBindingId && idSet.has(startBindingId)) {
				newEl.startBinding = null;
				isChanged = true;
			}
			const endBindingId = getBindingElementId(newEl.endBinding);
			if (endBindingId && idSet.has(endBindingId)) {
				newEl.endBinding = null;
				isChanged = true;
			}

			if (isChanged) {
				newEl.updated = Date.now();
				newEl.version = ((newEl.version as number) || 1) + 1;
			}

			return newEl;
		});

	const danglingEdgeIds = new Set<string>();
	for (const el of newElements) {
		if (el.type !== "arrow" && el.type !== "line") {
			continue;
		}

		const original = originalBindingState.get(el.id);
		const hadBinding = Boolean(original?.startId || original?.endId);
		if (!hadBinding) {
			continue;
		}

		const hasStart = Boolean(getBindingElementId(el.startBinding));
		const hasEnd = Boolean(getBindingElementId(el.endBinding));
		if (!hasStart || !hasEnd) {
			danglingEdgeIds.add(el.id);
			for (const bound of getBoundElements(el.boundElements)) {
				if (bound.type === "text") {
					danglingEdgeIds.add(bound.id);
				}
			}
		}
	}

	for (const edgeId of danglingEdgeIds) {
		idSet.add(edgeId);
	}

	const finalElements = newElements
		.filter((el) => !idSet.has(el.id))
		.map((el) => {
			if (!el.boundElements) {
				return el;
			}

			const currentBounds = getBoundElements(el.boundElements);
			const filteredBounds = currentBounds.filter(
				(bound) => !idSet.has(bound.id),
			);
			if (filteredBounds.length === currentBounds.length) {
				return el;
			}

			return {
				...el,
				boundElements: filteredBounds.length > 0 ? filteredBounds : null,
				updated: Date.now(),
				version: ((el.version as number) || 1) + 1,
			};
		});

	const textElements = { ...doc.textElements };
	const elementLinks = { ...doc.elementLinks };

	// Clean up metadata
	idSet.forEach((id) => {
		delete textElements[id];
		delete elementLinks[id];
	});

	return {
		...doc,
		textElements,
		elementLinks,
		drawing: {
			...doc.drawing,
			elements: finalElements,
		},
	};
}

export type ArrangeAction =
	| {
			type: "align";
			axis: "left" | "center" | "right" | "top" | "middle" | "bottom";
	  }
	| { type: "distribute"; axis: "horizontal" | "vertical" }
	| { type: "group" }
	| { type: "ungroup" }
	| { type: "lock" }
	| { type: "unlock" };

export type ArrangeOptions = {
	ids: ElementId[];
	action: ArrangeAction;
};

/**
 * Arranges elements by aligning, distributing, grouping, or locking them.
 */
export function arrangeElements(
	doc: ExcalidrawMdDocument,
	options: ArrangeOptions,
): ExcalidrawMdDocument {
	const { ids, action } = options;
	const idSet = new Set(ids);

	// Get the target elements
	const targetElements = doc.drawing.elements.filter((el) => idSet.has(el.id));

	if (targetElements.length === 0) {
		return doc;
	}

	let newElements = [...doc.drawing.elements];

	switch (action.type) {
		case "align": {
			const axis = action.axis;
			let referenceValue: number;

			// Calculate reference value based on alignment axis
			if (axis === "left") {
				referenceValue = Math.min(...targetElements.map((el) => el.x));
			} else if (axis === "right") {
				referenceValue = Math.max(
					...targetElements.map((el) => el.x + el.width),
				);
			} else if (axis === "top") {
				referenceValue = Math.min(...targetElements.map((el) => el.y));
			} else if (axis === "bottom") {
				referenceValue = Math.max(
					...targetElements.map((el) => el.y + el.height),
				);
			} else if (axis === "center") {
				const avgCenter =
					targetElements.reduce((sum, el) => sum + el.x + el.width / 2, 0) /
					targetElements.length;
				referenceValue = avgCenter;
			} else {
				// middle
				const avgMiddle =
					targetElements.reduce((sum, el) => sum + el.y + el.height / 2, 0) /
					targetElements.length;
				referenceValue = avgMiddle;
			}

			// Apply alignment
			newElements = doc.drawing.elements.map((el) => {
				if (!idSet.has(el.id)) return el;

				if (axis === "left") {
					return { ...el, x: referenceValue, updated: Date.now() };
				} else if (axis === "right") {
					return { ...el, x: referenceValue - el.width, updated: Date.now() };
				} else if (axis === "top") {
					return { ...el, y: referenceValue, updated: Date.now() };
				} else if (axis === "bottom") {
					return { ...el, y: referenceValue - el.height, updated: Date.now() };
				} else if (axis === "center") {
					return {
						...el,
						x: referenceValue - el.width / 2,
						updated: Date.now(),
					};
				} else {
					// middle
					return {
						...el,
						y: referenceValue - el.height / 2,
						updated: Date.now(),
					};
				}
			});
			break;
		}

		case "distribute": {
			const axis = action.axis;

			// Sort elements by position
			const sortedElements = [...targetElements].sort((a, b) => {
				if (axis === "horizontal") {
					return a.x - b.x;
				} else {
					return a.y - b.y;
				}
			});

			if (sortedElements.length < 2) {
				return doc;
			}

			if (axis === "horizontal") {
				const totalSpace =
					sortedElements[sortedElements.length - 1].x -
					sortedElements[0].x -
					sortedElements[sortedElements.length - 1].width;
				const gap = totalSpace / (sortedElements.length - 1);
				let currentX = sortedElements[0].x + sortedElements[0].width + gap;

				const distributionMap = new Map<string, number>();
				// Skip first and last elements
				for (let i = 1; i < sortedElements.length - 1; i++) {
					distributionMap.set(sortedElements[i].id, currentX);
					currentX += sortedElements[i].width + gap;
				}

				newElements = doc.drawing.elements.map((el) => {
					const newX = distributionMap.get(el.id);
					if (newX !== undefined) {
						return { ...el, x: newX, updated: Date.now() };
					}
					return el;
				});
			} else {
				// vertical
				const totalSpace =
					sortedElements[sortedElements.length - 1].y -
					sortedElements[0].y -
					sortedElements[sortedElements.length - 1].height;
				const gap = totalSpace / (sortedElements.length - 1);
				let currentY = sortedElements[0].y + sortedElements[0].height + gap;

				const distributionMap = new Map<string, number>();
				// Skip first and last elements
				for (let i = 1; i < sortedElements.length - 1; i++) {
					distributionMap.set(sortedElements[i].id, currentY);
					currentY += sortedElements[i].height + gap;
				}

				newElements = doc.drawing.elements.map((el) => {
					const newY = distributionMap.get(el.id);
					if (newY !== undefined) {
						return { ...el, y: newY, updated: Date.now() };
					}
					return el;
				});
			}
			break;
		}

		case "group": {
			// Generate a new group ID
			const groupId = generateId();

			newElements = doc.drawing.elements.map((el) => {
				if (idSet.has(el.id)) {
					return {
						...el,
						groupIds: [...el.groupIds, groupId],
						updated: Date.now(),
					};
				}
				return el;
			});
			break;
		}

		case "ungroup": {
			// Remove the last group ID from each element (most recent group)
			newElements = doc.drawing.elements.map((el) => {
				if (idSet.has(el.id) && el.groupIds.length > 0) {
					const newGroupIds = el.groupIds.slice(0, -1);
					return {
						...el,
						groupIds: newGroupIds,
						updated: Date.now(),
					};
				}
				return el;
			});
			break;
		}

		case "lock": {
			newElements = doc.drawing.elements.map((el) => {
				if (idSet.has(el.id)) {
					return {
						...el,
						locked: true,
						updated: Date.now(),
					};
				}
				return el;
			});
			break;
		}

		case "unlock": {
			newElements = doc.drawing.elements.map((el) => {
				if (idSet.has(el.id)) {
					return {
						...el,
						locked: false,
						updated: Date.now(),
					};
				}
				return el;
			});
			break;
		}
	}

	return {
		...doc,
		drawing: {
			...doc.drawing,
			elements: newElements,
		},
	};
}
