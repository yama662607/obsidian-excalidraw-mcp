## Context

Obsidian Excalidraw pluginは `.excalidraw.md` 形式でExcalidraw図をVault内に保存する。この形式はfrontmatter、Text Elements、Element Links、Embedded Files、Drawing（LZ-String圧縮JSON）のセクションで構成される。現在、AIエージェントがこの形式を安全に読み書きするMCPサーバーは存在しない。

プラグインのソースコード（MIT License、`zsviczian/obsidian-excalidraw-plugin`）を分析した結果、以下が確定している：
- 圧縮: `LZString.compressToBase64()` → 256文字ごとに改行挿入
- 展開: 改行除去 → `LZString.decompressFromBase64()`
- Drawing判定: `` ```compressed-json `` / `` ```json `` コードブロック
- セクション区切り: `# Excalidraw Data` → `## Text Elements` → `## Element Links` → `## Embedded Files` → `## Drawing`

## Goals / Non-Goals

**Goals:**
- `.excalidraw.md` を安全に読み書きできるMCPサーバーを構築する
- 圧縮透過処理によりツール利用者に圧縮を意識させない
- Element Links とObsidian wiki linkの整合を保つ
- 人間の手編集とAI編集の共存（競合検知 + atomic write）
- 12個の単一責務MCPツールを提供する
- 既存Obsidian MCPと補完関係で動作する

**Non-Goals:**
- ブラウザライブキャンバス、PNG/SVG export、viewport制御
- appState全自由編集、Mermaid変換
- Obsidian plugin bridge（将来フェーズ）
- 一般ノートCRUD（既存Obsidian MCPの領域）

## Decisions

### 1. 単一パッケージ・2層構成

`src/core/`（MCP非依存）と `src/server/`（MCPラッパー）のディレクトリ分離。モノレポではなく単一パッケージ内で管理する。

**理由**: coreをテストやCLIから直接使えるようにしつつ、モノレポの管理コストを避ける。

**代替案**: `packages/core` + `packages/mcp-server` のモノレポ → 管理コスト過大で却下。

### 2. LZ-Stringライブラリの直接利用

npm `lz-string` パッケージを使用し、`compressToBase64` / `decompressFromBase64` を呼ぶ。圧縮時は256文字ごとに改行を挿入（プラグインと同じ挙動）。

**理由**: プラグインのソースコード分析から、この方式が確実にinteropできることが確認済み。

### 3. MCP SDK v1.x（TypeScript）

`@modelcontextprotocol/sdk` v1.xを採用。stdio transportで動作。

**理由**: 公式推奨の安定版。v2は開発中で本番向けではない。

### 4. トランザクション的ファイル処理

`read → parse → decode → mutate → validate → encode → conflict check → atomic write` の一貫フロー。

**理由**: 部分書き込みやsync競合による破損を防ぐため。

### 5. Vault内ファイルシステム直接操作

Obsidian REST APIを経由せず、ファイルシステムを直接読み書きする。

**理由**: MCPサーバーはローカル実行前提。REST API依存を排除し、外部依存を最小化する。

## Risks / Trade-offs

- **[互換性リスク]** プラグインのフォーマットが更新された場合、パーサーの修正が必要 → 主要な正規表現とフォーマット仕様をテストfixtureで固定し、回帰テストで検知する
- **[競合リスク]** Obsidianが開いている状態でMCPが書き込むと競合する → mtime + sha256による楽観的競合検知で対応
- **[圧縮互換性]** LZ-Stringのバージョン差異 → プラグインと同じnpmパッケージを使用し、roundtripテストで検証する
