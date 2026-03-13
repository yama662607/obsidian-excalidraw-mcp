## ADDED Requirements

### Requirement: Parse excalidraw.md sections
The parser SHALL split a `.excalidraw.md` file into distinct sections: frontmatter, header notice, Text Elements, Element Links, Embedded Files, and Drawing.

#### Scenario: Parse compressed file
- **WHEN** a `.excalidraw.md` file with `compressed-json` Drawing block is provided
- **THEN** the parser SHALL return all sections with `drawingEncoding: "compressed-json"`

#### Scenario: Parse uncompressed file
- **WHEN** a `.excalidraw.md` file with `json` Drawing block is provided
- **THEN** the parser SHALL return all sections with `drawingEncoding: "json"`

#### Scenario: Parse minimal file
- **WHEN** a `.excalidraw.md` file with no Text Elements or Element Links is provided
- **THEN** the parser SHALL return empty maps for textElements and elementLinks

### Requirement: Extract Text Elements
The parser SHALL extract text element entries from the `## Text Elements` section, mapping element IDs to their text content.

#### Scenario: Multiple text elements
- **WHEN** the Text Elements section contains entries like `text content ^elementID`
- **THEN** the parser SHALL return a map of `{elementID: "text content"}`

### Requirement: Extract Element Links
The parser SHALL extract element link entries from the `## Element Links` section, mapping element IDs to wiki links.

#### Scenario: Wiki link extraction
- **WHEN** the Element Links section contains entries like `[[note-path]] ^elementID`
- **THEN** the parser SHALL return a map of `{elementID: "[[note-path]]"}`

### Requirement: Rebuild excalidraw.md
The parser SHALL reconstruct a complete `.excalidraw.md` file from a parsed document model, preserving the original encoding format.

#### Scenario: Roundtrip preservation
- **WHEN** a `.excalidraw.md` file is parsed and immediately rebuilt without modification
- **THEN** the rebuilt file SHALL be byte-identical to the original (modulo trailing whitespace)

### Requirement: Preserve back-of-note content
The parser SHALL preserve any user content between the frontmatter and `# Excalidraw Data` heading.

#### Scenario: User notes preserved
- **WHEN** a file has content between frontmatter and Excalidraw Data heading
- **THEN** that content SHALL be preserved in the headerNoticeText field and included in rebuild
