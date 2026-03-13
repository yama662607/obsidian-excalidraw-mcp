## ADDED Requirements

### Requirement: MCP server with 12 tools
The system SHALL expose 12 MCP tools via stdio transport: inspect_drawing, add_node, add_edge, update_elements, delete_elements, arrange_elements, manage_element_links, suggest_links_for_elements, create_note_from_element, analyze_drawing, snapshot_drawing, convert_drawing_format.

#### Scenario: Tool registration
- **WHEN** the MCP server starts
- **THEN** all 12 tools SHALL be registered with Zod schemas and MCP annotations (readOnlyHint, destructiveHint)

### Requirement: Tool annotations
Each tool SHALL have appropriate MCP annotations: `readOnlyHint: true` for inspect_drawing, analyze_drawing, suggest_links_for_elements; `destructiveHint: true` for delete_elements.

#### Scenario: Read-only tool annotation
- **WHEN** inspect_drawing is called
- **THEN** it SHALL not modify any files and SHALL be annotated as readOnlyHint

### Requirement: Vault root configuration
The MCP server SHALL accept a `--vault` argument specifying the Obsidian Vault root directory.

#### Scenario: Start with vault path
- **WHEN** the server starts with `--vault /path/to/vault`
- **THEN** all file operations SHALL be scoped to that directory
