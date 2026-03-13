## ADDED Requirements

### Requirement: Decompress compressed-json Drawing
The codec SHALL decompress LZ-String Base64 encoded Drawing data by stripping newlines and calling `LZString.decompressFromBase64()`.

#### Scenario: Decompress valid data
- **WHEN** a compressed-json code block contains LZ-String Base64 data with newlines every 256 characters
- **THEN** the codec SHALL return the decompressed JSON string

#### Scenario: Handle plain JSON
- **WHEN** the Drawing section uses a `json` code block
- **THEN** the codec SHALL return the JSON string as-is without decompression

### Requirement: Compress scene JSON
The codec SHALL compress scene JSON using `LZString.compressToBase64()` and insert newlines every 256 characters for readability.

#### Scenario: Compress and format
- **WHEN** a JSON string is compressed
- **THEN** the output SHALL use `LZString.compressToBase64()` with newlines inserted every 256 characters, matching the Obsidian Excalidraw plugin format

### Requirement: Roundtrip fidelity
The codec SHALL guarantee that `decompress(compress(json))` produces JSON that is semantically equivalent to the original.

#### Scenario: Roundtrip test
- **WHEN** a valid Excalidraw scene JSON is compressed and then decompressed
- **THEN** the resulting JSON SHALL parse to an identical object as the original
