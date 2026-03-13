## 1. プロジェクト基盤

- [ ] 1.1 `npm init` でpackage.jsonを作成し、TypeScript/Vitest/tsupを設定する
- [ ] 1.2 `src/core/` と `src/server/` のディレクトリ構造を作成する
- [ ] 1.3 依存ライブラリをインストールする（`@modelcontextprotocol/sdk`, `zod`, `lz-string`, `vitest`, `tsup`）
- [ ] 1.4 tsconfig.json を設定する
- [ ] 1.5 テスト用fixtureディレクトリ `fixtures/` を作成し、参照リポジトリからのサンプル `.excalidraw.md` を用意する

## 2. 圧縮コーデック (compression-codec)

- [ ] 2.1 `src/core/codec/` に `compress()` / `decompress()` を実装する（LZString.compressToBase64 / decompressFromBase64 + 256文字改行）
- [ ] 2.2 圧縮・展開のユニットテストを作成する
- [ ] 2.3 roundtrip テスト（compress → decompress で元と一致）を作成する

## 3. パーサー (excalidraw-md-parser)

- [ ] 3.1 `src/core/parser/` に `.excalidraw.md` のセクション分離パーサーを実装する（frontmatter / headerNotice / Text Elements / Element Links / Embedded Files / Drawing）
- [ ] 3.2 Text Elements セクションの抽出（elementID → text）を実装する
- [ ] 3.3 Element Links セクションの抽出（elementID → wiki link）を実装する
- [ ] 3.4 Drawing セクションの抽出（compressed-json / json 判定 + コーデック呼び出し）を実装する
- [ ] 3.5 パーサーのユニットテストを作成する（compressed / uncompressed / minimal / no-links）
- [ ] 3.6 `.excalidraw.md` 再構築関数を実装し、roundtrip テストを作成する

## 4. ドキュメントモデル (document-model)

- [ ] 4.1 `src/core/model/` に `ExcalidrawMdDocument` 型を定義する
- [ ] 4.2 `ExcalidrawScene` 型を定義する
- [ ] 4.3 `ElementLinkMap` 型と `ParsedWikiLink` パーサーを実装する
- [ ] 4.4 model のユニットテストを作成する

## 5. ストレージ (safe-storage)

- [ ] 5.1 `src/core/storage/` にファイル読み込み + fileStat（mtime, size, sha256）取得を実装する
- [ ] 5.2 atomic write（tmp → fsync → rename）を実装する
- [ ] 5.3 競合検知（保存前の fileStat 比較）を実装する
- [ ] 5.4 スナップショット管理（create / list / restore）を実装する
- [ ] 5.5 パス制限（Vault外アクセス拒否）を実装する
- [ ] 5.6 ストレージのユニットテストを作成する

## 6. 要素編集 (element-editing)

- [ ] 6.1 `src/core/services/` にノード追加サービス（add_node）を実装する
- [ ] 6.2 エッジ追加サービス（add_edge）を実装する
- [ ] 6.3 要素更新サービス（update_elements）を実装する
- [ ] 6.4 要素削除サービス（delete_elements + link/edge cleanup）を実装する
- [ ] 6.5 配置操作サービス（arrange_elements: align/distribute/group/lock）を実装する
- [ ] 6.6 各サービスのユニットテストを作成する
- [ ] 6.7 edit → save → reopen のインテグレーションテストを作成する

## 7. リンク管理 (element-links)

- [ ] 7.1 `src/core/services/` に Element Links CRUD サービス（manage_element_links）を実装する
- [ ] 7.2 リンク修復機能（repair: パス正規化・孤立リンク除去）を実装する
- [ ] 7.3 リンク候補提案サービス（suggest_links_for_elements: ファイル名マッチング）を実装する
- [ ] 7.4 ノート作成サービス（create_note_from_element）を実装する
- [ ] 7.5 各サービスのユニット/インテグレーションテストを作成する

## 8. 知識分析 (knowledge-analysis)

- [ ] 8.1 `src/core/analysis/` に要約分析（summary）を実装する
- [ ] 8.2 未リンク要素検出（unlinked）を実装する
- [ ] 8.3 重複概念検出（duplicates）を実装する
- [ ] 8.4 inspect_drawing サービス（summary/elements/element/text/links/query）を実装する
- [ ] 8.5 分析のユニットテストを作成する

## 9. MCPサーバー (mcp-server)

- [ ] 9.1 `src/server/` に MCP server 初期化（stdio transport）を実装する
- [ ] 9.2 12ツールの Zod schema を定義する
- [ ] 9.3 12ツールの handler を実装する（core サービスへの委譲）
- [ ] 9.4 MCP annotations（readOnlyHint / destructiveHint）を設定する
- [ ] 9.5 `--vault` 引数の処理を実装する
- [ ] 9.6 CLIエントリーポイント（`src/server/index.ts`）を作成する

## 10. 変換・スナップショットツール

- [ ] 10.1 convert_drawing_format ツール（.excalidraw.md ↔ .excalidraw JSON）を実装する
- [ ] 10.2 snapshot_drawing ツール（create/list/restore）を MCPツールとして公開する
- [ ] 10.3 各ツールのテストを作成する

## 11. 品質仕上げ

- [ ] 11.1 エラーコード体系を定義する（E_PARSE_*, E_CODEC_*, E_CONFLICT_*, etc.）
- [ ] 11.2 JSON lines ログ設定を実装する
- [ ] 11.3 README.md を作成する
- [ ] 11.4 TOOL_REFERENCE.md を作成する
- [ ] 11.5 全テストを実行し、greedテストで回帰を確認する
