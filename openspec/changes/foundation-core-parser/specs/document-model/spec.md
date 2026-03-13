## ADDED Requirements

### Requirement: ExcalidrawMdDocument model
The system SHALL define an `ExcalidrawMdDocument` type that holds: path, frontmatter, headerNoticeText, textElements, elementLinks, drawing (as ExcalidrawScene), drawingEncoding, originalText, and fileStat (mtimeMs, size, sha256).

#### Scenario: Full document model
- **WHEN** a `.excalidraw.md` file is loaded
- **THEN** all fields of ExcalidrawMdDocument SHALL be populated from the parsed content

### Requirement: ExcalidrawScene model
The system SHALL define an `ExcalidrawScene` type containing: type ("excalidraw"), version, source, elements array, appState, and files map.

#### Scenario: Preserve unknown fields
- **WHEN** the scene JSON contains fields not defined in the model
- **THEN** those fields SHALL be preserved during serialization (no data loss)

### Requirement: ElementLinkMap model
The system SHALL define an `ElementLinkMap` as `Record<ElementId, WikiLink>` with a parsed representation including targetPath, alias, and subpath.

#### Scenario: Parse wiki link with alias
- **WHEN** an element link is `[[folder/note|Display Name]]`
- **THEN** the parsed link SHALL have targetPath `folder/note` and alias `Display Name`
