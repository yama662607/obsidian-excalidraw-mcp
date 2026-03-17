# obsidian-excalidraw-mcp

MCP server for safely editing `.excalidraw.md` files as visual knowledge objects in Obsidian.

## Features
- Secure, spec-compliant editing of Excalidraw markdown files
- Atomic file operations and path validation
- Batch link repair, element CRUD, and snapshot management
- Full test coverage and robust error handling

## Contracts

### inspect_drawing summary contract

- `summary.linkedElementsCount` counts unique active elements (`isDeleted !== true`) that have a link.
- The link source can be either:
	- `Element Links` section (`doc.elementLinks[elementId]`)
	- element-level link property (`drawing.elements[n].link`), including `embeddable` elements
- This definition keeps `mode=summary` and `mode=elements` consistent.

### Error response contract

On failure, tools return `isError: true` and expose the same payload in both:

- `structuredContent` (object)
- `content[0].text` (JSON string for compatibility)

Payload schema:

```json
{
	"isError": true,
	"code": "E_NOT_FOUND_NOTE",
	"message": "File not found: ...",
	"correlationId": "uuid"
}
```

The response shape is consistent across not found, parse failure, and path outside vault failures.

### Compatibility impact

- `linkedElementsCount` may increase compared to older behavior when links existed only in element-level `link` properties.
- Error output is now machine-readable JSON payloads instead of plain string-only messages.

## Installation

```
npm install obsidian-excalidraw-mcp
```

## Usage

```
npx obsidian-excalidraw-mcp --help
```

## Requirements
- Node.js >= 20

## License
MIT

## Author
Copyright (c) 2026 daisukeyamashiki
