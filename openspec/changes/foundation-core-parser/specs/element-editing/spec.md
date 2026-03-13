## ADDED Requirements

### Requirement: Add node elements
The system SHALL support adding node-type elements (rectangle, ellipse, diamond, frame, text-container) with position, size, text, style, and optional parent frame.

#### Scenario: Add rectangle with text
- **WHEN** add_node is called with shapeType "rectangle", position, size, and initial text
- **THEN** the scene SHALL contain a new rectangle element with a bound text element

### Requirement: Add edge elements
The system SHALL support adding edge-type elements (arrow, line) with source, target, label, style, and optional waypoints.

#### Scenario: Add arrow between nodes
- **WHEN** add_edge is called with from and to element IDs
- **THEN** the scene SHALL contain a new arrow element with startBinding and endBinding set

### Requirement: Update existing elements
The system SHALL support patch-style updates to existing elements (text, style, position, size) in a single transaction.

#### Scenario: Batch update
- **WHEN** update_elements is called with multiple element patches
- **THEN** all patches SHALL be applied atomically and the file saved once

### Requirement: Delete elements with cleanup
The system SHALL support deleting elements, cleaning up stale Element Links and dangling edges.

#### Scenario: Delete linked element
- **WHEN** a node with an Element Link is deleted
- **THEN** the Element Link entry SHALL also be removed from the document

### Requirement: Arrange elements
The system SHALL support align, distribute, group, ungroup, lock, and unlock operations.

#### Scenario: Lock elements
- **WHEN** arrange is called with action "lock" and element IDs
- **THEN** the specified elements SHALL have their locked property set to true
