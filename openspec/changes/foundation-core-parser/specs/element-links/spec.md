## ADDED Requirements

### Requirement: CRUD Element Links
The system SHALL support get, set, remove, and repair operations on Element Links (element ID → wiki link mappings).

#### Scenario: Set element link
- **WHEN** manage_element_links is called with action "set", element ID, and wiki link
- **THEN** the Element Links section SHALL contain the new mapping and the document SHALL be saved

#### Scenario: Repair broken links
- **WHEN** manage_element_links is called with action "repair"
- **THEN** links referencing non-existent elements SHALL be removed and paths SHALL be normalized

### Requirement: Suggest links from Vault
The system SHALL propose existing Vault notes as link candidates based on element text/label matching.

#### Scenario: Text-based suggestion
- **WHEN** suggest_links_for_elements is called with element IDs
- **THEN** the system SHALL return a list of candidate note paths with match scores based on file name similarity to element labels

### Requirement: Create note from element
The system SHALL create a new Obsidian note from an element's text, set up a template, and link the element to the new note in a single operation.

#### Scenario: Create and link
- **WHEN** create_note_from_element is called with an element ID and target note path
- **THEN** a new note SHALL be created, and the element SHALL be linked to it via Element Links
