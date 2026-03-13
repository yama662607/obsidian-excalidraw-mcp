以下は、開発担当エージェントに渡す計画書の**第1部「思想と背景」**です。
実装方針ではなく、**なぜこのMCPを作るのか、何を守り、何を目指すのか**を定義します。

---

## 1. このMCPを作る理由

このMCPの目的は、**Obsidian上の知識体系と、Excalidrawによる視覚的な理解を、AIが壊さず接続できるようにすること**です。

MCPのツール設計では、各ツールは**単一の操作**を、**明確な入出力**で提供するのが基本原則です。MCPの公式ドキュメントでも、各ツールは「明確に定義された入力と出力を持つ単一の操作」を行うべきとされています。 ([Model Context Protocol][1])

一方で、Obsidian Excalidraw plugin は単なるお絵描き機能ではなく、Vault内に図を保存し、文書や他の図へのリンク、埋め込み、リンク操作などを提供することで、**図を知識ベースの一部として扱う**設計になっています。 ([GitHub][2])

この2つを合わせて考えると、必要なのは一般的な「Excalidraw操作MCP」ではありません。
必要なのは、**`.excalidraw.md` を第一級の知識オブジェクトとして扱い、Obsidianのノート体系と安全につなぐMCP**です。

---

## 2. 解決したい問題

既存のExcalidraw系MCPは、主に次のどちらかに寄っています。

ひとつは、ブラウザ上のキャンバスをリアルタイムで操作するタイプです。
もうひとつは、ExcalidrawのJSONファイルを汎用的に編集するタイプです。

これらはどちらも有用ですが、今回の目的にはそのままでは足りません。理由は、**Obsidianの知識体系**と**`.excalidraw.md` の保存実態**が関わるからです。

Obsidian API には `Vault`、`Workspace`、`MetadataCache` があり、`MetadataCache` はMarkdownファイルのリンク、埋め込み、タグなどのメタデータを保持します。つまり、Obsidianではノートは単体ファイルではなく、**リンクされた知識ネットワーク**として扱われます。 ([GitHub][3])

さらに、Obsidian Excalidraw plugin は、Excalidrawの図をVault内に保存し、ノートや他の図へのリンク、埋め込み、リンク挙動の設定を提供しています。つまり、図は単なる画像ではなく、**知識体系に接続されたノード**です。 ([GitHub][2])

このため、一般的なExcalidraw JSON編集だけでは不十分です。
必要なのは、

* `.excalidraw.md` を直接扱うこと
* 圧縮されたDrawingデータを透過的に編集すること
* Element Links と Obsidian wiki link を壊さないこと
* 人間の手編集と AI 編集が共存できること

です。

---

## 3. このMCPの基本思想

### 3.1 正本は Obsidian Vault に置く

このMCPでは、**唯一の正本は Obsidian Vault 内の `.excalidraw.md` と `.md`** です。

外部のライブキャンバスや一時状態を正本にしません。
ブラウザUIや補助的な可視化があっても、それは編集体験の補助にすぎず、**知識の実体は Vault に残る**べきです。

これは、Obsidianがファイルベースで知識を管理し、Vaultを中心にリンクや埋め込みを扱う仕組みと整合しています。Obsidian APIも `Vault` と `MetadataCache` を中核として公開しています。 ([GitHub][3])

### 3.2 図は「絵」ではなく「知識オブジェクト」である

このMCPにおいて Excalidraw 図は、単なる視覚資料ではありません。
図は、

* 概念ノード
* 概念間の関係
* ノートへの参照
* 知識のまとまり

を持つ**視覚的知識グラフ**です。

そのため、このMCPは「rectangle を描けること」自体を主目的にしません。
主目的は、**図の要素が何を意味し、どのノートと結びつき、知識体系の中でどう位置づくか**を保ったまま編集できることです。

### 3.3 AIは代筆者ではなく、知識編集の補助者である

このMCPは、AIが図を全部自動生成するためのものではありません。
あなた自身が図を描き、構造を考え、意味を決め、その途中でAIが次を補助することを想定しています。

* 関連ノートの発見
* 既存概念との接続提案
* 未リンク要素の検出
* 重複概念の整理
* ノート作成の補助
* 図の整形と保守

つまり、AIは主役ではなく、**知識体系の保守と補完を行う編集支援者**です。

---

## 4. なぜ `.excalidraw.md` を主対象にするのか

Excalidraw本体の標準的なデータ表現はJSONベースですが、Obsidian Excalidraw plugin はそれをVault運用に適した形で保存・編集できるようにしています。plugin のREADMEでも、Vault内にExcalidrawファイルを保存・編集し、文書や他の図へリンクできることが示されています。 ([GitHub][2])

また、設定ドキュメントでは、Drawing JSON を圧縮する設定や、Markdown view で展開して扱う挙動が説明されています。つまり `.excalidraw.md` は、単なるラッパーではなく、**Obsidianで知識として運用するための実用的な保存形式**です。 ([Obsidian-Excalidraw][4])

この形式を主対象にする理由は3つです。

第一に、**Obsidianのノート体系と自然に接続できる**からです。
第二に、**人間がObsidianでそのまま開いて編集できる**からです。
第三に、**AI編集と人間編集を同じファイル上で合流させられる**からです。

---

## 5. 圧縮を受け入れる理由

`.excalidraw.md` の Drawing 部分は圧縮されることがあります。Obsidian Excalidraw の設定でも、Drawing JSON の圧縮と、Markdown view での展開が説明されています。 ([Obsidian-Excalidraw][4])

このMCPでは、圧縮は問題ではなく、**保存表現のひとつ**とみなします。
編集時の本質は scene JSON であり、圧縮は保存効率とVault運用の都合です。

したがって思想としては、

```text
保存形式 = 圧縮された .excalidraw.md
編集形式 = 展開された scene JSON
```

です。

重要なのは、**圧縮・展開をユーザーや上位エージェントに見せないこと**です。
MCP内部で自動的に

* 読み込み
* 展開
* 編集
* 再圧縮
* 安全保存

を行います。

---

## 6. このMCPが既存MCPとどう違うか

このMCPは、一般的な Excalidraw MCP の代替ではありません。
既存の Excalidraw MCP は、図形生成やライブキャンバス操作に強みがあります。
既存の Obsidian MCP は、Vault全体の読み書きや検索、知識グラフ探索に強みがあります。

このMCPの役割は、その中間にある**空白領域**です。

つまり、

* Excalidrawとしては一般的すぎず
* Obsidianとしては単なるノートCRUDに留まらず
* `.excalidraw.md` と Obsidianリンクの整合を守る

という役割です。

ひとことで言うと、このMCPは

**Obsidian Visual Knowledge MCP**

です。

図形編集ツールではなく、**視覚的知識編集ツール**として設計します。

---

## 7. 守るべき設計原則

このMCPの設計原則は次の通りです。

### 7.1 壊さないことを最優先する

AIが便利に編集できることより、**既存の図とリンクを壊さないこと**を優先します。
そのため、破壊的操作は明確に分離し、保存は atomic write で行い、競合も検知します。

MCPでも、ツールの副作用や破壊性は注釈で正確に示すことが推奨されています。`readOnlyHint`、`destructiveHint`、`idempotentHint` などは、ツールの意味境界を明確にするために重要です。 ([Model Context Protocol][5])

### 7.2 ツールは単一責務にする

ツールは「何でもできる魔法の操作」にしません。
MCPの原則どおり、**単一の意味的責務**を持たせます。 ([Model Context Protocol][1])

### 7.3 低レベル操作より高レベル意図を優先する

単に `rectangle を作る` だけではなく、
`要素をノートに接続する`
`未リンク概念を洗い出す`
`要素からノートを作る`
のような、知識編集に直接つながる操作を重視します。

### 7.4 既存MCPと競合せず、補完する

一般ノート探索やVault検索は既存の Obsidian MCP に任せられます。
このMCPは `.excalidraw.md` の深い編集に集中します。
つまり、**全部入りを目指さない**ことも思想の一部です。

---

## 8. 想定する利用体験

このMCPが目指す体験は次です。

あなたが Obsidian で図を描く。
AI がその図の要素を読み、関連ノートを探し、必要ならリンクを提案し、不足ノートを作り、図の整合を保つ。
その後、あなたがまた図を直し、AIが再び補助する。

この循環です。

```text
人間が描く
→ AIが知識体系に接続する
→ 人間が構造を調整する
→ AIが不足や重複を監査する
→ 図とノートが同時に育つ
```

このMCPは、その循環を支えるための基盤です。

---

## 9. この段階で開発担当エージェントに伝えるべき要点

開発担当エージェントには、まず次を理解してもらう必要があります。

このプロジェクトは、Excalidrawの図形APIを再発明することが目的ではない。
ObsidianのノートCRUDを再実装することも目的ではない。
目的は、**`.excalidraw.md` を中心に、視覚的知識編集を安全に実現すること**である。

そのために、

* 正本は Vault
* 主対象は `.excalidraw.md`
* 圧縮は内部で透過処理
* Element Links は第一級
* AIは補助者
* 人間編集との共存が前提
* 壊さないことが最優先
* 既存Obsidian系MCPとは補完関係

という思想をぶらさず実装する必要があります。

---

以上が第1部「思想と背景」です。
この内容を前提に、次の段階では **要求仕様とスコープ定義** に進むのが自然です。

[1]: https://modelcontextprotocol.io/docs/learn/server-concepts?utm_source=chatgpt.com "Understanding MCP servers"
[2]: https://github.com/zsviczian/obsidian-excalidraw-plugin?utm_source=chatgpt.com "A plugin to edit and view Excalidraw drawings in Obsidian"
[3]: https://github.com/obsidianmd/obsidian-api?utm_source=chatgpt.com "Type definitions for the latest Obsidian API."
[4]: https://excalidraw-obsidian.online/wiki/settings?utm_source=chatgpt.com "Excalidraw Settings overview"
[5]: https://modelcontextprotocol.io/legacy/concepts/tools?utm_source=chatgpt.com "Tools"
