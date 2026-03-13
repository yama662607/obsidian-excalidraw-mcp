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
			elements: newElements,
		},
	};
}
