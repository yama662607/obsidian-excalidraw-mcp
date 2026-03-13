## ADDED Requirements

### Requirement: Atomic write
The storage layer SHALL write files atomically using tmp-file → fsync → rename strategy to prevent partial writes.

#### Scenario: Write interrupted
- **WHEN** the process is killed during a save operation
- **THEN** the original file SHALL remain intact (no partial content)

### Requirement: Conflict detection
The storage layer SHALL detect concurrent modifications by comparing mtime, size, and sha256 hash before writing.

#### Scenario: External modification detected
- **WHEN** the file has been modified externally since it was loaded
- **THEN** the storage layer SHALL reject the write with `E_CONFLICT_MODIFIED` error

#### Scenario: No conflict
- **WHEN** the file has not been modified since it was loaded
- **THEN** the write SHALL proceed successfully

### Requirement: Snapshot management
The storage layer SHALL support creating, listing, and restoring file snapshots in a `.ai-excalidraw-snapshots/` directory.

#### Scenario: Create and restore snapshot
- **WHEN** a snapshot is created and then restored
- **THEN** the file SHALL be identical to the state when the snapshot was created

### Requirement: Path restriction
The storage layer SHALL reject operations on files outside the configured Vault root path.

#### Scenario: Path traversal blocked
- **WHEN** a path containing `../` that resolves outside the Vault root is provided
- **THEN** the operation SHALL be rejected with an error
