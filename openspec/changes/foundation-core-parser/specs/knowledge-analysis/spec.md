## ADDED Requirements

### Requirement: Analyze drawing structure
The system SHALL analyze an Excalidraw drawing as a knowledge structure, providing summary statistics, unlinked elements, duplicate concepts, and cluster extraction.

#### Scenario: Summary analysis
- **WHEN** analyze_drawing is called with mode "summary"
- **THEN** the system SHALL return element count, linked element count, link ratio, and cluster count

#### Scenario: Unlinked detection
- **WHEN** analyze_drawing is called with mode "unlinked"
- **THEN** the system SHALL return a list of text/labeled elements that have no Element Link

#### Scenario: Duplicate detection
- **WHEN** analyze_drawing is called with mode "duplicates"
- **THEN** the system SHALL return groups of elements with identical or near-identical labels

### Requirement: inspect_drawing read-only access
The system SHALL provide read-only inspection of drawings including element listing, text elements, element links, and search.

#### Scenario: Query elements by text
- **WHEN** inspect_drawing is called with mode "query" and a search term
- **THEN** the system SHALL return elements whose text or labels match the search term
