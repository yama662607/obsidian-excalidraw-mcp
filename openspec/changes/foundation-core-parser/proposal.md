## Why

Obsidian Excalidraw pluginは `.excalidraw.md` を通じて図を知識体系に組み込むが、AIエージェントがこの形式を安全に読み書きする手段がない。既存のExcalidraw系MCPはブラウザキャンバス操作か汎用JSON編集に寄っており、Obsidianの知識体系（wiki link、Element Links、圧縮透過）との整合を守る仕組みが欠けている。

## What Changes

- `.excalidraw.md` のMarkdownセクション分離パーサーを新規実装（frontmatter / Text Elements / Element Links / Embedded Files / Drawing）
- LZ-String compressed-json の透過的エンコード・デコード codec を新規実装
- 正規化ドキュメントモデル（`ExcalidrawMdDocument`）と scene モデルを新規定義
- ファイルI/O層（atomic write、mtime/sha256 競合検知）を新規実装
- 整合チェッカー（壊れたlinks、孤立edge、重複ID）を新規実装
- 12個のMCPツール（inspect / add_node / add_edge / update / delete / arrange / manage_links / suggest_links / create_note / analyze / snapshot / convert）をstdio MCPサーバーとして提供
- 既存 Obsidian MCP との補完関係で動作する設計

## Capabilities

### New Capabilities
- `excalidraw-md-parser`: `.excalidraw.md` ファイルのセクション分離・再構築パーサー
- `compression-codec`: LZ-String Base64 圧縮・展開の透過処理
- `document-model`: 正規化ドキュメントモデルとsceneモデル定義
- `safe-storage`: atomic write、競合検知、スナップショット管理
- `element-editing`: ノード・エッジの追加・更新・削除・配置操作
- `element-links`: Element Links の CRUD と整合修復
- `knowledge-analysis`: 図の知識構造分析（未リンク検出、重複概念、クラスタ抽出）
- `mcp-server`: 12ツールのstdio MCPサーバー

### Modified Capabilities
<!-- なし — 新規プロジェクト -->

## Impact

- **新規コードベース**: TypeScript + Node.js、`src/core/` と `src/server/` の2層構成
- **依存ライブラリ**: `@modelcontextprotocol/sdk`, `zod`, `lz-string`, `vitest`
- **ファイルシステム操作**: Obsidian Vault内の `.excalidraw.md` を直接読み書き
- **既存MCPとの関係**: Obsidian Local REST API MCP と補完的に併用される前提
