以下は計画書の**第2部「要求仕様とスコープ定義」**です。
この段階では、**何を作るか**と**何を作らないか**を明確にし、開発担当エージェントが実装の境界を迷わないようにします。

---

## 1. プロジェクトの対象

このMCPが直接扱う主対象は、**Obsidian Vault 内の `.excalidraw.md` ファイル**です。
Obsidian API は `Vault` をファイルとフォルダの操作対象として持ち、`MetadataCache` は各Markdownファイルのリンク、埋め込み、タグ、見出しなどのメタデータを保持します。つまり Obsidian 上では、`.excalidraw.md` も Vault の一部である Markdown 系ファイルとして知識体系に組み込まれます。 ([GitHub][1])

また、Obsidian Excalidraw plugin は Vault 内で Excalidraw drawings を保存・編集し、文書や他の図へのリンクも扱います。さらに設定上、Drawing JSON は圧縮保存でき、Markdown view では自動展開もできます。 ([GitHub][2])

このため、本MCPの対象は次の3層です。

```text
1. .excalidraw.md 全体
2. Drawing セクションの scene JSON
3. Obsidian 知識体系との接続情報
   - wiki link
   - Element Links
   - ノート対応
```

---

## 2. このフェーズで実現すること

このフェーズで実現するのは、**安全な読み取り、構造的な編集、Obsidianノートとの接続、形式変換、分析、復元**です。
MCPの公式チュートリアルでも、サーバーの主能力は Resources / Tools / Prompts に分かれ、今回の中心は **Tools** です。ツールは JSON Schema で定義される単一操作であるべきです。 ([Model Context Protocol][3])

このMCPで実装する正式スコープは、次の12ツールです。

```text
1. inspect_drawing
2. add_node
3. add_edge
4. update_elements
5. delete_elements
6. arrange_elements
7. manage_element_links
8. suggest_links_for_elements
9. create_note_from_element
10. analyze_drawing
11. snapshot_drawing
12. convert_drawing_format
```

これは前段で確定した設計をそのまま採用します。

---

## 3. ツールごとの責務定義

### 3.1 inspect_drawing

責務は**読み取り専用**です。
要素一覧、特定要素、テキスト要素、Element Links、簡単な要約・検索を返します。
このツールは `readOnlyHint: true` を付けられるように設計します。MCPの tools ベストプラクティスでも、読み取り専用であることを annotations で明示することが推奨されています。 ([Model Context Protocol][4])

**含める範囲**

* scene 要約
* element 一覧
* 特定 ID 要素の取得
* text element 一覧
* element links 一覧
* ラベルや型による検索

**含めない範囲**

* 変更処理
* 推薦
* ノート作成

---

### 3.2 add_node

責務は**ノード系要素の新規追加**です。

**対象**

* rectangle
* ellipse
* diamond
* frame
* text-box 的な独立ノード

ここでは図形ごとにツールを分けません。
代わりに `shapeType` を引数に持たせます。

**含める範囲**

* 座標
* サイズ
* shape type
* 初期テキスト
* style
* 親 frame 指定

**含めない範囲**

* 矢印や線
* 既存要素の更新
* ノートリンク付与

---

### 3.3 add_edge

責務は**接続系要素の新規追加**です。

**対象**

* arrow
* line
* elbow / polyline 相当の接続要素

ノード作成と分ける理由は、接続元・接続先・waypoints など、入力の意味が明確に違うからです。

**含める範囲**

* from / to
* edge type
* label
* style
* waypoint

**含めない範囲**

* ノード追加
* 既存接続の更新
* 自動リンク推薦

---

### 3.4 update_elements

責務は**既存要素の更新**です。

これは次を含みます。

* 座標更新
* サイズ更新
* テキスト更新
* style 更新
* ラベル更新

更新は削除より破壊性が低いので、`delete_elements` とは分離します。
MCPでは副作用の種類を明確にするのが重要です。 ([Model Context Protocol][4])

**含める範囲**

* patch 型更新
* 複数要素一括更新

**含めない範囲**

* 削除
* 整列
* lock/unlock
* Element Links 更新

---

### 3.5 delete_elements

責務は**要素削除**です。

これは最も破壊的な編集のひとつなので、独立ツールにします。
`destructiveHint: true` を前提とした設計にします。MCPのベストプラクティスでも、破壊的かどうかを annotation で明示することが推奨されています。 ([Model Context Protocol][4])

**含める範囲**

* 単一・複数要素削除
* 関連 Element Links の掃除
* 必要なら orphan edge の整合処理

**含めない範囲**

* 更新
* 退避
* 形式変換

---

### 3.6 arrange_elements

責務は**配置と編集保護の調整**です。

**含める操作**

* align
* distribute
* group
* ungroup
* lock
* unlock

これらは意味内容ではなく、レイアウトと編集可能性を調整する操作として一群にまとめます。

**含めない範囲**

* 要素の意味変更
* ノートリンク
* 分析

---

### 3.7 manage_element_links

責務は**Element Links の CRUD と整合修復**です。

Obsidian Excalidraw plugin は drawing から documents や drawings へのリンクを扱えます。あなたの例でも `## Element Links` セクションに要素IDと wiki link の対応が保存されています。これはこのMCPの中核領域です。 ([GitHub][2])

**含める範囲**

* 要素IDに対する link 取得
* link 設定
* link 削除
* 破損リンクの修復

**含めない範囲**

* 候補提案
* 新規ノート作成

---

### 3.8 suggest_links_for_elements

責務は**既存 Vault から候補ノートを提案すること**です。

このツールは編集しません。
ラベルやテキストを手がかりに、既存の Obsidian 系MCPや Vault検索結果を使って候補を返します。

**含める範囲**

* ラベル→既存ノート候補
* 複数候補のスコア付け
* 相対パス正規化候補

**含めない範囲**

* 実際のリンク適用
* ノート新規作成

---

### 3.9 create_note_from_element

責務は**図の要素から新規ノートを作成し、要素へリンクする複合操作**です。

これは高水準ツールです。
一般の Obsidian MCP 側でノート生成ができるとしても、このMCPでは「要素→ノート→リンク付与」を一貫した意図として提供します。

**含める範囲**

* note path 決定
* 初期タイトル
* 初期本文テンプレート
* Element Link 設定

**含めない範囲**

* 既存ノート候補の推薦
* 図の分析

---

### 3.10 analyze_drawing

責務は**図を知識構造として分析すること**です。

これは read-only 系です。

**含める範囲**

* summary
* unlinked elements
* duplicate concepts
* orphan concepts
* cluster extraction
* concept graph extraction

Obsidian Excalidraw plugin 自体は図を知識体系に接続できますが、図全体を semantic に分析するMCPは既存群でも弱いので、これは差別化ポイントです。 ([GitHub][2])

---

### 3.11 snapshot_drawing

責務は**復元ポイント管理**です。

**含める範囲**

* create snapshot
* list snapshots
* restore snapshot

これは安全装置として重要です。
人間が同じファイルを触る前提なので、保存前後の rollback 手段を持ちます。

---

### 3.12 convert_drawing_format

責務は**`.excalidraw.md` と公式 Excalidraw 形式の往復**です。

Excalidraw本体は open format として `.excalidraw` JSON を扱います。Obsidian Excalidraw 側は Markdown ベース保存を持ちます。両者を往復できるようにします。 ([GitHub][2])

**含める範囲**

* `.excalidraw.md` → `.excalidraw`
* `.excalidraw` → `.excalidraw.md`

**含めない範囲**

* PNG/SVG export
* shareable URL

---

## 4. スコープに含める内部機能

これらはツールとして公開しませんが、**必須の内部機能**です。

### 4.1 `.excalidraw.md` パーサ

* frontmatter
* Text Elements
* Element Links
* Drawing block
  を分離して扱います。

### 4.2 圧縮透過処理

Obsidian Excalidraw の設定では、Drawing JSON の圧縮保存と Markdown view での展開がサポートされています。MCP内部でもこれを透過的に処理します。 ([Obsidian-Excalidraw][5])

### 4.3 競合検知

人間編集とAI編集が競合しうるため、mtime やハッシュで再保存前に確認します。

### 4.4 atomic write

部分書き込みによる破損を避けるため、保存は atomic に行います。

### 4.5 整合チェック

* 削除された要素に残る Element Links
* 孤立した edge
* 不正な scene 構造
  を検査します。

---

## 5. このフェーズで作らないもの

ここを明確にしないと、実装が肥大化します。

### 5.1 ブラウザライブキャンバス

このMCPは live canvas server を作るものではありません。
既存の Excalidraw MCP 群の強みですが、今回のフェーズでは対象外です。

### 5.2 screenshot / image export

PNG、SVG、スクリーンショット出力は作りません。
このMCPの中心は知識編集であり、画像出力ではありません。

### 5.3 viewport / camera 制御

ズーム、スクロール位置、カメラ操作は対象外です。

### 5.4 appState 全自由編集

theme、selection、UI state などの広範な appState 操作は扱いません。
安全性と責務の明確さを優先します。

### 5.5 Mermaid 変換

Mermaid → Excalidraw 変換はスコープ外です。

### 5.6 Obsidian plugin bridge の実装

このフェーズでは MCP server 単体です。
将来的に plugin bridge を追加できる構造にはしますが、初期実装には含めません。

---

## 6. 成果物の範囲

このフェーズの成果物は次です。

### 必須成果物

* MCP server 本体
* `.excalidraw.md` core parser / codec / model
* 12ツールの schema と handler
* 圧縮透過処理
* 競合検知
* atomic save
* 基本テスト

### 必須ではないが望ましい成果物

* サンプル `.excalidraw.md` fixture 群
* 開発用 CLI
* デバッグログ設定
* エラーコード体系

---

## 7. 成功条件

このフェーズの成功条件は、次を満たすことです。

1. 圧縮された `.excalidraw.md` を安全に読める。 ([Obsidian-Excalidraw][5])
2. 要素編集後に再圧縮しても Obsidian Excalidraw で正常に開ける。 ([GitHub][2])
3. Element Links を壊さず更新できる。
4. 人間が Obsidian で編集したあとでも、競合を検知できる。
5. 12ツールの責務が重複しない。
6. 既存 Obsidian 系MCP と併用して補完関係になる。

---

## 8. 開発担当エージェントへの指示

この段階で開発担当エージェントには、次を厳守させます。

* スコープ外機能を勝手に入れない
* `.excalidraw.md` を正本として扱う
* 低レベル図形APIの再発明に寄りすぎない
* Obsidian知識体系との接続を最優先する
* 圧縮を外部仕様に露出しない
* 安全保存と競合検知を後回しにしない

---

以上が第2部「要求仕様とスコープ定義」です。
次に進む段階では、**アーキテクチャ設計とモジュール分割**を具体化するのが適切です。

[1]: https://github.com/obsidianmd/obsidian-api?utm_source=chatgpt.com "obsidianmd/obsidian-api: Type definitions for the latest ..."
[2]: https://github.com/zsviczian/obsidian-excalidraw-plugin?utm_source=chatgpt.com "A plugin to edit and view Excalidraw drawings in Obsidian"
[3]: https://modelcontextprotocol.io/docs/develop/build-server?utm_source=chatgpt.com "Build an MCP server"
[4]: https://modelcontextprotocol.io/llms-full.txt?utm_source=chatgpt.com "llms - full.txt"
[5]: https://excalidraw-obsidian.online/wiki/settings?utm_source=chatgpt.com "Excalidraw Settings overview"
