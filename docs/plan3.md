以下は計画書の**第3部以降の残りすべて**です。
ここでは、**アーキテクチャ、モジュール分割、データモデル、ツール仕様、エラー設計、保存戦略、テスト戦略、実装順序、完了条件**まで一気に定義します。

---

# 第3部 アーキテクチャ設計

## 1. 全体アーキテクチャ

本MCPは、**MCPサーバー本体**と、そこから利用される**純粋なコアライブラリ**に分けます。
MCPの公式設計では、サーバーは特定の能力を公開し、ツールは型付き入出力を持つ単一操作として提供されます。TypeScript SDK はサーバー実装のための公式実装で、Node.js 上で動作します。v2 は開発中で、現時点では **v1.x が本番推奨**です。 ([Model Context Protocol][1])

構成は次です。

```text
packages/
  core/
  mcp-server/
  fixtures/
  docs/
```

`core` は MCP 非依存にします。
ここに `.excalidraw.md` の読み書き、圧縮展開、scene 編集、Element Links 整合、競合検知、atomic save のすべてを置きます。

`mcp-server` は薄く作ります。
ここは MCP SDK、Zod schema、ツール定義、handler、ログ、transport のみを担当します。

この分離の理由は、将来的に

* CLI から同じロジックを使う
* テストで MCP を介さず core を直接叩く
* 将来 Obsidian plugin bridge を追加する

ためです。

---

## 2. 実行モデル

実行モデルは **ローカル stdio サーバー**を基本にします。
MCP は tools / resources / prompts を持てますが、今回の中核は tools です。公式ドキュメントでも、tools はモデルが呼び出す schema-defined interface であり、単一操作を明確な入力と出力で提供することが前提です。 ([Model Context Protocol][1])

このプロジェクトでは、

* resources は作らない
* prompts も初期フェーズでは作らない
* tools だけを実装する

方針にします。

理由は、責務を絞るためです。
`.excalidraw.md` 編集はツールとして完結させるのが最も自然です。

---

## 3. 技術スタック

採用スタックは次で固定します。

```text
Language: TypeScript
Runtime: Node.js
SDK: @modelcontextprotocol/server v1.x
Validation: Zod
File I/O: fs/promises + atomic write
Compression codec: LZ-String compatible
Tests: Vitest
Bundling: tsup または esbuild
Transport: stdio
```

MCP TypeScript SDK は Node.js / Bun / Deno で動作し、v1.x が現行本番向けです。 ([GitHub][2])
Obsidian 側も TypeScript 前提の API を提供しており、`Vault`、`Workspace`、`MetadataCache` を中心に扱います。 ([GitHub][3])

---

# 第4部 モジュール分割

## 1. core の内部構成

`packages/core/src/` は次のように分けます。

```text
core/
  parser/
  codec/
  model/
  services/
  validators/
  storage/
  analysis/
  types/
```

### parser

`.excalidraw.md` をセクション単位で分解します。

担当:

* frontmatter 抽出
* `# Excalidraw Data` 以下の各セクション抽出
* `## Text Elements`
* `## Element Links`
* `## Drawing`
* `compressed-json` ブロック判定

### codec

Drawing セクションのエンコードとデコードを扱います。

担当:

* plain JSON のパース
* compressed-json の展開
* 再圧縮
* `.excalidraw` JSON との相互変換

Obsidian Excalidraw は Drawing JSON の圧縮保存と Markdown view での展開をサポートしています。 ([Obsidian-Excalidraw][4])

### model

内部で扱う正規化データ構造を定義します。

### services

ツールが呼ぶユースケース層です。

担当:

* inspect
* add node
* add edge
* update
* delete
* arrange
* links
* analyze
* snapshot
* convert

### validators

整合チェックをまとめます。

担当:

* 重複ID
* 不正な要素
* 孤立 edge
* 壊れた link
* 無効 path
* 互換性確認

### storage

ファイル読み書きと競合検知を扱います。

担当:

* read file
* hash / mtime
* atomic save
* snapshot save/restore

### analysis

知識構造分析を扱います。

担当:

* unlinked detection
* duplicate concepts
* cluster detection
* concept graph extraction
* semantic summary support

---

## 2. mcp-server の内部構成

```text
mcp-server/
  tools/
  schemas/
  adapters/
  server.ts
  index.ts
```

### tools

各ツールの handler。

### schemas

各ツールの Zod schema。

### adapters

core の戻り値を MCP tool result へ整形する層。

### server.ts

MCP server 初期化。

### index.ts

CLI エントリーポイント。

---

# 第5部 データモデル

## 1. ドキュメントモデル

`.excalidraw.md` は内部で次のモデルに正規化します。

```ts
type ExcalidrawMdDocument = {
  path: string;
  frontmatter: Record<string, unknown> | null;
  rawFrontmatterText: string | null;
  headerNoticeText: string | null;
  textElements: Record<string, string>;
  elementLinks: Record<string, string>;
  drawing: ExcalidrawScene;
  drawingEncoding: "compressed-json" | "json";
  originalText: string;
  fileStat: {
    mtimeMs: number;
    size: number;
    sha256: string;
  };
};
```

### 設計意図

* `frontmatter` は構造化して保持
* `textElements` と `elementLinks` は drawing と別に保持
* `drawing` は常に**展開済み scene JSON**
* `drawingEncoding` で保存形式を維持
* `fileStat` で競合検知

---

## 2. scene モデル

scene は Excalidraw 公式 JSON に近い構造で保持します。
Excalidraw の JSON schema は scene を JSON として表現し、`elements` などの構造を持ちます。 ([Model Context Protocol][1])

```ts
type ExcalidrawScene = {
  type: "excalidraw";
  version: number;
  source?: string;
  elements: ExcalidrawElement[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
};
```

### 方針

* `appState` は原則読み書き保存するが、自由編集対象にはしない
* `elements` が編集対象の中心
* 不明フィールドは落とさず保持

---

## 3. Element Links モデル

Obsidian Excalidraw plugin は links と embedding を重要機能として持ちます。リンク動画群・リンク機能・native hyperlink の案内もあります。 ([GitHub][5])

内部モデル:

```ts
type ElementLinkMap = Record<ElementId, WikiLink>;
```

ここで `WikiLink` は、単なる文字列ではなく、必要なら分解表現も持てるようにします。

```ts
type ParsedWikiLink = {
  raw: string;
  targetPath: string;
  alias?: string;
  subpath?: string;
};
```

---

# 第6部 ツール仕様

ここでは 12 ツールを最終仕様として定義します。

## 1. inspect_drawing

責務は読み取り専用です。
annotation は `readOnlyHint: true`。

### 主な mode

* `summary`
* `elements`
* `element`
* `text`
* `links`
* `query`

### 返却内容

* 図の基本情報
* 要素数
* 要素一覧
* 特定要素
* テキスト要素
* link 一覧
* 簡易検索結果

### 分けない理由

読み取りは同一責務であり、MCP上でも read-only として明快に扱えるためです。 ([Model Context Protocol][1])

---

## 2. add_node

ノード系追加専用。

### shapeType

* rectangle
* ellipse
* diamond
* frame
* text-container 相当

### 入力

* path
* shapeType
* x, y
* width, height
* text
* style
* optional parentFrameId

### 出力

* createdElementIds
* updatedSummary

---

## 3. add_edge

接続系追加専用。

### edgeType

* arrow
* line
* elbow/polyline

### 入力

* from / to
* label
* style
* optional waypoints

### 注意

source / target は要素IDまたは座標の両対応にすると実用性が高いです。

---

## 4. update_elements

既存要素更新専用。

### 対象

* text
* style
* position
* size
* metadata 的 patch

### 入力

複数 patch をまとめて受け取れるようにします。

### 方針

一度展開して複数更新し、一度だけ再圧縮して保存します。

---

## 5. delete_elements

削除専用。
annotation は `destructiveHint: true`。

### 対象

* 単一要素
* 複数要素
* 関連する stale elementLinks の掃除
* dangling edge の整合処理

---

## 6. arrange_elements

配置と編集保護の調整専用。

### action

* align
* distribute
* group
* ungroup
* lock
* unlock

### 理由

意味を変える操作ではなく、レイアウト調整としてまとめられるためです。

---

## 7. manage_element_links

Element Links の CRUD と repair に限定します。

### action

* get
* set
* remove
* repair

### repair

* 相対 path 正規化
* 既存ノート再解決
* エイリアス整形

---

## 8. suggest_links_for_elements

候補提示専用。
annotation は `readOnlyHint: true`。

### 入力

* elementIds
* strategy
* optional search context

### 返却

* 候補ノート
* スコア
* 根拠
* 推薦理由

このツールは既存 Obsidian MCP と併用される想定です。
Local REST API はノートの read/create/update/delete、PATCH、コマンド実行を提供するので、一般ノート探索はそちらに寄せられます。 ([GitHub][6])

---

## 9. create_note_from_element

高水準複合ツール。

### 処理

* 要素のラベル取得
* note path 決定
* 初期本文生成
* ノート作成
* element link 設定

### 入力

* path
* elementId
* notePath
* title
* templateKind

### 出力

* created note path
* applied link
* updated element summary

---

## 10. analyze_drawing

知識構造分析専用。
annotation は `readOnlyHint: true`。

### mode

* summary
* unlinked
* duplicates
* orphans
* clusters
* concept_graph

### 返却

* 図の概念要約
* 未リンク要素
* 重複ラベル
* クラスタ
* 関係グラフ

---

## 11. snapshot_drawing

復元ポイント管理専用。

### action

* create
* list
* restore

### 保存先

Vault 直下ではなく、専用 hidden ディレクトリを基本にします。

例:

```text
<vault>/.ai-excalidraw-snapshots/
```

---

## 12. convert_drawing_format

形式変換専用。

### action

* export_excalidraw_json
* import_excalidraw_json

### 方針

PNG/SVG は扱いません。
Excalidraw settings でも SVG/PNG 埋め込みは別の export 文脈であり、今回の知識編集の中心ではありません。 ([Obsidian-Excalidraw][4])

---

# 第7部 ファイル処理と保存戦略

## 1. 読み込みフロー

すべての編集ツールは次の共通フローを通します。

```text
read file
→ parse markdown sections
→ detect drawing encoding
→ decode drawing
→ validate document
→ execute operation
→ validate result
→ encode drawing
→ rebuild markdown
→ conflict check
→ atomic write
```

これを共通の transaction 関数にします。

---

## 2. 圧縮透過処理

Obsidian Excalidraw settings では Drawing JSON の圧縮設定があり、Markdown view では展開して読めます。 ([Obsidian-Excalidraw][4])

MCP でも次を保証します。

* 入力ファイルが compressed-json でも plain JSON でも読める
* 内部編集表現は常に展開済み JSON
* 保存時は元形式を維持
* オプションで「常に compressed に統一」も可能にするが、初期実装では元形式維持を優先

---

## 3. 競合検知

人間編集との共存が前提なので必須です。

### 方法

読み込み時に

* mtime
* size
* sha256

を記録し、保存前に再確認します。

### 競合時

* 書き戻しを拒否
* `E_CONFLICT_MODIFIED` を返す
* 現在版の再読込を促す

---

## 4. atomic write

保存は直接上書きしません。

```text
tmp file write
→ fsync
→ rename replace
```

を使います。
途中状態の破損を防ぎます。

---

## 5. バックアップとスナップショット

スナップショットは user visible な Git の代替ではありません。
目的は AI 編集の即時 rollback です。

### 保存内容

* 元 `.excalidraw.md` の完全コピー
* メタ情報

  * source path
  * timestamp
  * optional label

---

# 第8部 エラー設計

## 1. エラーの大分類

エラーは少なくとも次に分けます。

```text
ParseError
CodecError
ValidationError
ConflictError
NotFoundError
LinkResolutionError
OperationError
StorageError
```

---

## 2. 代表エラーコード

```text
E_PARSE_INVALID_MD
E_PARSE_MISSING_DRAWING_SECTION
E_CODEC_UNSUPPORTED_ENCODING
E_CODEC_DECOMPRESS_FAILED
E_VALIDATE_BROKEN_SCENE
E_VALIDATE_DUPLICATE_IDS
E_CONFLICT_MODIFIED
E_NOT_FOUND_ELEMENT
E_NOT_FOUND_NOTE
E_LINK_INVALID_WIKILINK
E_STORAGE_WRITE_FAILED
E_OPERATION_UNSUPPORTED
```

### 方針

ツール失敗時は、
人間にも AI にも読める短い explanation を返します。

---

# 第9部 ログ設計

## 1. ログ方針

ログは JSON lines を基本にします。

記録項目:

* timestamp
* tool name
* path
* action
* encoding
* file size
* duration
* changed element count
* conflict detected
* result

### 理由

MCP ツール実行の追跡とデバッグを簡単にするためです。

---

## 2. ログレベル

* error
* warn
* info
* debug

初期値は info。

---

# 第10部 テスト設計

## 1. テスト戦略の原則

テストの中心は `core` です。
MCP handler より、まず core の正しさを固めます。

---

## 2. フィクスチャ

最低限、次の fixture を用意します。

### 形式別

* compressed `.excalidraw.md`
* uncompressed `.excalidraw.md`
* minimal document
* large document

### 内容別

* element links あり
* element links なし
* broken links
* duplicate labels
* grouped elements
* locked elements
* frames あり
* dangling edge あり

---

## 3. テスト種類

### unit test

* parser
* codec
* validators
* element mutators
* link operations

### integration test

* add node → save → reopen
* update text → save → reopen
* set link → analyze
* delete element → link cleanup
* import/export roundtrip
* snapshot restore
* conflict detection

### golden test

既知の `.excalidraw.md` を編集し、期待結果と一致することを確認します。

---

## 4. 回帰重点

特に壊れやすい箇所:

* compressed-json roundtrip
* Element Links 整合
* grouped/locked element 保持
* note path 正規化
* delete 時の副作用
* import/export の可逆性

---

# 第11部 実装順序

## Phase 0 設計固定

* tool schema 固定
* core interfaces 固定
* fixture 設計
* error code 一覧固定

## Phase 1 codec / parser

* markdown section parser
* compressed/plain decoder
* encoder
* roundtrip test

## Phase 2 core model / storage

* document model
* scene model
* file loader
* conflict detection
* atomic save

## Phase 3 基本編集

* inspect_drawing
* add_node
* add_edge
* update_elements
* delete_elements

## Phase 4 レイアウト / links

* arrange_elements
* manage_element_links

## Phase 5 高水準知識機能

* suggest_links_for_elements
* create_note_from_element
* analyze_drawing

## Phase 6 safety / format

* snapshot_drawing
* convert_drawing_format

## Phase 7 MCP wrapping

* zod schema
* annotations
* tool handlers
* stdio server

## Phase 8 polish

* logs
* errors
* docs
* examples

---

# 第12部 既存MCPとの連携設計

## 1. 役割分担

このMCPは全部入りではありません。
既存 Obsidian MCP と補完関係で使います。

### 既存 Obsidian MCP が得意なこと

* Vault 全体の検索
* 一般 Markdown ノート操作
* frontmatter
* broader knowledge graph traversal

Obsidian Local REST API も secure HTTPS + API key でノートの read/create/update/delete、PATCH、コマンド実行を提供しています。 ([GitHub][6])

### このMCP が得意なこと

* `.excalidraw.md` の安全編集
* Element Links
* compressed-json 透過処理
* 図の知識構造分析
* 図要素とノートの接続

---

## 2. 期待するエージェント動作

理想フロー:

```text
既存 Obsidian MCP で関連ノート探索
→ 自作MCPで suggest_links_for_elements
→ 必要なら create_note_from_element
→ 自作MCPで manage_element_links
→ 自作MCPで analyze_drawing
```

---

# 第13部 セキュリティと安全性

## 1. path 制限

編集対象は Vault 配下に制限します。
相対パス解決後に Vault 外へ出るものは拒否します。

## 2. note path 検証

`create_note_from_element` では、危険な path traversal を拒否します。

## 3. 破壊操作の明示

`delete_elements` は destructive 扱いにします。
MCP docs でも destructive / idempotent / readonly を annotation で明示するのが推奨されています。 ([Model Context Protocol][1])

## 4. open-world 操作の最小化

外部 API 呼び出しはしません。
このMCPはローカル Vault 操作に閉じます。

---

# 第14部 ドキュメント設計

最低限、次の文書を作ります。

### README

* 目的
* 対象
* インストール
* 使い方
* 既存 Obsidian MCP との併用方針

### TOOL_REFERENCE.md

12ツールすべての

* 役割
* 入力
* 出力
* annotation
* 典型例

### ARCHITECTURE.md

* core / server 分離
* parse/codec/storage flow
* save transaction
* conflict detection

### TESTING.md

* fixture
* test strategy
* regression focus

---

# 第15部 完了条件

このフェーズの完了条件は、以下をすべて満たすことです。

## 必須

1. compressed / uncompressed の両方を読める。 ([Obsidian-Excalidraw][4])
2. 編集後に Obsidian Excalidraw で正常に再オープンできる。 ([GitHub][5])
3. Element Links を壊さず CRUD できる。
4. 競合検知が働く。
5. delete で stale link が残らない。
6. import/export が roundtrip できる。
7. 12ツールがすべて schema 付きで動く。
8. README と Tool Reference が揃う。

## 品質目標

* fixture coverage が十分ある
* 主要ツールに integration test がある
* エラーコードが安定している
* ログで追跡可能

---

# 第16部 開発担当エージェントへの最終指示

以下を最重要ルールとして守ってください。

**1. 正本は Vault 内の `.excalidraw.md` である。**
外部状態を正本にしてはいけない。

**2. 圧縮は外部仕様に見せず、内部で透過処理する。**
ユーザーや上位エージェントに decompress / recompress を意識させない。

**3. `.excalidraw.md` の編集は、必ず transaction として扱う。**
read → parse → decode → mutate → validate → encode → conflict check → atomic write。

**4. Element Links は第一級データとして扱う。**
Drawing だけ編集して満足してはいけない。

**5. 既存 Obsidian MCP を置き換えない。**
一般ノート探索や Vault 全体の知識探索は補完的に使う。

**6. 低レベル図形APIの再発明に寄りすぎない。**
目的は Visual Knowledge Editing である。

**7. 壊さないことを最優先する。**
便利さより整合性を優先する。

---

# 最終まとめ

このMCPは、一般的な Excalidraw ツールではありません。
また、一般的な Obsidian ノート操作ツールでもありません。

これは、

**`.excalidraw.md` を安全に読み書きし、Obsidianの知識体系と視覚構造を結びつけるための Visual Knowledge MCP**
です。

完成形は次です。

```text
TypeScript + Node.js
core / mcp-server 分離
12個の単一責務ツール
compressed-json 透過処理
Element Links 第一級対応
競合検知 + atomic write
既存 Obsidian MCP と補完運用
```

この方針で実装すれば、
**人間が描く図** と **AIが補助する知識編集** を、同じ `.excalidraw.md` 上で破綻なく共存させられます。

[1]: https://modelcontextprotocol.io/docs/learn/server-concepts "Understanding MCP servers - Model Context Protocol"
[2]: https://github.com/modelcontextprotocol/typescript-sdk "GitHub - modelcontextprotocol/typescript-sdk: The official TypeScript SDK for Model Context Protocol servers and clients · GitHub"
[3]: https://github.com/obsidianmd/obsidian-api "GitHub - obsidianmd/obsidian-api: Type definitions for the latest Obsidian API. · GitHub"
[4]: https://excalidraw-obsidian.online/wiki/settings "Excalidraw Settings overview - Obsidian-Excalidraw"
[5]: https://github.com/zsviczian/obsidian-excalidraw-plugin "GitHub - zsviczian/obsidian-excalidraw-plugin: A plugin to edit and view Excalidraw drawings in Obsidian · GitHub"
[6]: https://github.com/coddingtonbear/obsidian-local-rest-api "GitHub - coddingtonbear/obsidian-local-rest-api: Unlock your automation needs by interacting with your notes in Obsidian over a secure REST API. · GitHub"
