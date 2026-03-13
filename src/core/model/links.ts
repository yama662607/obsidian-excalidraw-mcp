import {
	ErrorCodes,
	ExcalidrawMcpError,
	type ParsedWikiLink,
	type WikiLink,
} from "@core/types";

//           1         2         3
// Match: [[ target | alias ]] # subpath
// This regex handles various Obsidian wiki link formats
// Group 1: target path (required)
// Group 2: subpath (optional, starts with #)
// Group 3: alias (optional, starts with |)
const WIKI_LINK_RE = /^\[\[(.*?)\]\]$/;

/**
 * Parses a raw wiki link string into its components.
 *
 * Supports formats:
 * - [[target-file]]
 * - [[target-file|Alias Text]]
 * - [[target-file#heading|Alias Text]]
 */
export function parseWikiLink(rawLink: WikiLink): ParsedWikiLink {
	const match = rawLink.match(WIKI_LINK_RE);

	if (!match) {
		throw new ExcalidrawMcpError(
			ErrorCodes.E_LINK_INVALID_WIKILINK,
			`Invalid wiki link format: ${rawLink}`,
		);
	}

	const innerContent = match[1];
	let targetPath = innerContent;
	let alias: string | undefined;
	let subpath: string | undefined;

	// Check for alias
	const aliasIdx = innerContent.indexOf("|");
	if (aliasIdx !== -1) {
		alias = innerContent.slice(aliasIdx + 1);
		targetPath = innerContent.slice(0, aliasIdx);
	}

	// Check for subpath (heading or block ref)
	const subpathIdx = targetPath.indexOf("#");
	if (subpathIdx !== -1) {
		subpath = targetPath.slice(subpathIdx);
		targetPath = targetPath.slice(0, subpathIdx);
	}

	return {
		raw: rawLink,
		targetPath: targetPath.trim(),
		alias: alias?.trim(),
		subpath: subpath?.trim(),
	};
}

/**
 * Builds a wiki link string from its components.
 */
export function buildWikiLink(
	targetPath: string,
	alias?: string,
	subpath?: string,
): WikiLink {
	let inner = targetPath;

	if (subpath) {
		inner += subpath.startsWith("#") ? subpath : `#${subpath}`;
	}

	if (alias) {
		inner += `|${alias}`;
	}

	return `[[${inner}]]`;
}
