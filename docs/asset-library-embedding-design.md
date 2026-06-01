# 图片素材库：Embedding 语义检索设计

> 文档状态：设计/讲解文档。配套代码：`backend/src/templates/asset-library.service.ts`、
> `entities/asset-library-image.entity.ts`、`pooled-template-asset-store.ts`、
> `image-generation.ts`。背景见 memory `template-asset-reuse-plan`。

本文解释为什么用 embedding 做素材复用、embedding 到底是什么、怎么算相似度，以及在本项目里端到端怎么落地。目标是看完这篇就能理解并实现，不需要预备知识。

---

## 1. 要解决的问题

模板生成时，每个 `core.image` 节点对应一个 `visualAsset`（带 `alt`/`prompt`/`role`，如 alt=「橘子」、role=product）。我们想：**先在已生成的图片库里找一张语义相近的现成图直接复用，找不到再调 AI 生图**（省钱省时）。

难点在「语义相近」：库里可能只有「苹果」图，来的是「橘子」，它俩都属于「水果」，应该能复用。最早的做法是维护一张「同义词 → 大类」的关键词词典（橘子→fruit、苹果→fruit…）。问题：

- 这个词典**无限膨胀**，永远在追着加词（砂糖橘、丑橘、blood orange…）。
- 不管放代码、JSON 还是数据库，本质都是「手维一张穷举表」，换位置不解决膨胀。

**结论**：细粒度语义匹配不该用穷举关键词表，应该用 **embedding 向量检索**。大类（数量少、有界）可以继续用一张可运行时编辑的小表/枚举。

---

## 2. Embedding 是什么（直观理解）

**Embedding = 把一段文本变成一串固定长度的数字（向量），让"意思相近的文本"对应"空间里相近的点"。**

- 你把字符串 `"橘子"` 丢给一个 embedding 模型，它返回一个定长向量，例如 1536 个浮点数：
  `"橘子" → [0.013, -0.082, 0.041, … ] (1536 维)`
- 关键性质：**语义越接近，向量越接近**。
  - `"橘子"`、`"苹果"`、`"香蕉"` 的向量彼此距离很近（都在"水果"附近的区域）。
  - `"橘子"` 和 `"宇宙飞船"` 的向量距离很远。
- 你不需要懂模型内部。把它当成一个黑盒函数 `embed(text) -> number[]`，唯一要记住的就是：**意思近 → 向量近**。

> 几何直觉：想象每个词是高维空间里的一个点。"水果"类的词聚成一团，"服饰"类的词聚成另一团。新词（哪怕词典里从没见过）也会自动落到它语义所在的那团附近 —— 这就是为什么 embedding 能处理"无限膨胀"的新词，而穷举词典不能。

---

## 3. 怎么衡量"两个向量有多近"——余弦相似度

最常用的是**余弦相似度 (cosine similarity)**：看两个向量的"方向"有多一致，忽略长度。

```
cos(A, B) = (A · B) / (|A| * |B|)

A · B      = 逐元素相乘再求和  = a1*b1 + a2*b2 + ... + an*bn   （点积）
|A|        = sqrt(a1^2 + a2^2 + ... + an^2)                    （向量长度/模）
```

- 结果范围 **[-1, 1]**：`1` = 方向完全一致（语义几乎相同），`0` = 不相关，`<0` = 相反。
- 实战中文本 embedding 的余弦值通常在 0.2~0.9 之间，我们设一个**阈值**（如 ≥ 0.45）来判定"够像才复用"。

**工程小技巧：先归一化，再只算点积。**
如果入库时就把每个向量归一化成单位长度（`v / |v|`），那么 `|A| = |B| = 1`，余弦相似度就退化成**点积**，匹配时少算两个开方，更快：

```
normalize(v) = v / |v|          // 入库时做一次
similarity   = dot(qNorm, vNorm) // 查询时只需点积
```

几百/几千行直接在内存里 for 循环算点积就够快，不需要专门的向量数据库。

---

## 4. 本项目端到端流程

### 4.1 预生成 / 入库时：算一次向量存起来

```
对每张要入库的图（manifest 项 或 已有图）:
  text  = 拼接它的语义描述，如 `${alt} ${category} ${keywords.join(' ')} ${prompt}`
  vec   = embed(text)            // 调 embedding 模型，返回 number[]
  vec   = normalize(vec)         // 归一化成单位向量
  存库: AssetLibraryImage { ...原有字段, embedding: vec }
```

- embedding 只在**入库时算一次**，之后查询不再重算这张图。
- 已有图（`assets:import-existing`）同样补算 embedding 入库。

### 4.2 模板生成 / 匹配时：embed 查询 + 最近邻

```
resolveVisualAsset(asset):
  ... asset.url 复用 / 精确 findExisting ...
  // 语义复用（findByIndex 的新实现）:
  qText = `${asset.alt} ${asset.role} ${asset.prompt}`
  qVec  = normalize(embed(qText))
  candidates = 库里所有图（可选先按大类/角色粗筛缩小范围）
  best = argmax over candidates of dot(qVec, img.embedding)
  if best.score >= THRESHOLD(如 0.45):
      复用 best.url（跳过生图）
  else:
      回退到原有占位符 / 生图逻辑
```

- 「橘子」的 qVec 会和「苹果」图的向量点积很高 → 命中复用，**全程不需要任何关键词词典**。
- `role` 仍可作为**粗筛或加分**（product 优先匹配 product），但不是必须。

### 4.3 它怎么接进现有代码（只改一处）

之前已经搭好了存储端口的 `findByIndex(context)` 扩展点：

```
TemplateAssetStore.findByIndex?(context: AssetLookupContext): Promise<StoredImage | null>
PooledTemplateAssetStore.findByIndex  ->  AssetLibraryService.findBestMatch(context)
```

**改造范围**：只把 `AssetLibraryService.findBestMatch` 的实现从"关键词打分"换成"embedding 最近邻"；`resolveVisualAsset`、`PooledTemplateAssetStore`、所有调用方都不动。`CATEGORY_LEXICON` 删除。

---

## 5. 数据模型改动

### 5.1 `AssetLibraryImage` 加一列

```ts
// entities/asset-library-image.entity.ts
@Column({ type: 'simple-json', nullable: true })
embedding: number[] | null;   // 已归一化的单位向量；本地用 JSON 存即可
```

- 本地 SQLite：用 `simple-json` 存浮点数组，几百~几千行完全够用，查询时全量读出来内存里算点积。
- 规模化（上万张 / Postgres）：改用 **pgvector** 的 `vector` 列 + `<=>` 余弦距离索引；SQLite 可上 **sqlite-vss**。届时只换存储/查询实现，`findByIndex` 接口不变。

### 5.2 大类单独成表（可选，对应"实时更新大类"）

```ts
@Entity('asset_categories')
class AssetCategory {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) key: string;   // fruit / fashion / ...
  @Column() labelZh: string;                // 水果 / 服饰
  @Column({ type: 'simple-json', default: '[]' }) aliases: string[];
}
```

- 大类数量少、有界、稳定，放表里可**运行时增改**，正好满足"实时更新"。
- 大类只用于**粗筛 / 加分**，细粒度匹配交给 embedding。所以这张表不会膨胀。

---

## 6. 用哪个 embedding 模型 + 成本

- `AI_PROVIDER=openai` 时用 OpenAI 的 embedding 模型，建议 **`text-embedding-3-small`**（1536 维，便宜，质量足够）。新增环境变量 `AI_EMBEDDING_MODEL`，默认 `text-embedding-3-small`。
- `openai-compatible`（DeepSeek / 本地）：用各自的 `/embeddings` 端点；本地可用 `bge-*` / `m3e` 等中文友好模型。
- 调用方式（OpenAI SDK）：`openai.embeddings.create({ model, input })` → `resp.data[0].embedding`（`number[]`）。
- **成本**：`text-embedding-3-small` ≈ $0.00002 / 1k tokens。一条 alt+prompt 几十个 token → 单次约 $0.0000004，**比一张图片生成（~$0.04）便宜约 5 个数量级**。入库每图算一次、查询每 asset 算一次，成本可忽略。
- 与"省成本"初衷一致：用极廉价的 embedding 检索，换掉昂贵的图片重复生成。

---

## 7. 阈值、坑、调参

- **阈值 THRESHOLD**：太低会乱复用，太高会基本命不中、退化成每次生图。**实测 `text-embedding-3-small` 相似度带**（pilot 真实数据）：精确同主体 ~0.5+、同大类近似（橘子↔苹果）~0.35-0.45、跨类（牛肉↔苹果）~0.22、无关（宇宙飞船↔苹果）~0.18。**当前取 `MATCH_THRESHOLD = 0.35`**（让"同大类复用"生效、排除跨类乱命中）；库变密后可上调。日志会打印命中 score 便于调。
- **⚠️ embedding 文本只放"主体语义"，别放 role/category（踩过的坑）**：最初把 role 词（"hero"/"product"）也拼进 embedding 文本，结果「宇宙飞船 hero」和「生鲜篮 hero」因共享 "hero" 被拉近、误命中（相似度被结构词抬过阈值）。改成只编码 `alt + keywords + prompt`（纯主体）后，宇宙飞船正确不命中、橘子命中真橘子图。**role/category 只作结构化加分/粗筛，不进向量。**
- **role 不一致**：一张 hero 大图复用到 product 卡位会比例不对。当前做法：同 role 给 `+ROLE_BOOST(0.05)` 仅影响排序、不绕过阈值；需要更严可改成同 role 硬过滤。
- **拼接文本要稳定**：入库和查询用同样的字段拼接口径（`buildEmbeddingText` 一个方法两边共用），否则同一主体两边向量偏移。改了口径必须 `--reindex-all` 全量重算。
- **空库**：库为空直接返回 null（回退生图），已处理。
- **归一化别忘了**：入库归一化了，查询向量也要归一化，否则点积 ≠ 余弦。
- **中文**：`text-embedding-3-*` 对中文支持不错；如对中文要求高可换中文 embedding 模型。

---

## 8. 实施步骤清单（✅ 已实现）

1. ✅ 配置：`config.factory` 加 `ai.models.embedding`（读 `AI_EMBEDDING_MODEL`，openai 默认 `text-embedding-3-small`）；`.env.example` 已补。
2. ✅ 工具：`text-embedding.ts` 的 `embedText(config, text)`（调 `/embeddings`、归一化）+ `dot()`（点积=余弦）+ `normalizeVector()`。
3. ✅ 实体：`AssetLibraryImage` 加 `embedding` 列（simple-json，nullable，1536 维）。
4. ✅ 入库：`pregenerateOne` / `registerExisting` 算并存 embedding。
5. ✅ 匹配：`findBestMatch` = embed 查询 + 内存余弦最近邻 + 阈值；`CATEGORY_LEXICON` 已删除。
6. ⬜（可选，未做）`asset_categories` 表 + 粗筛/加分 —— 当前用 role 加分即可。
7. ✅ 回填：`reindexMissing(force?)` + CLI `assets:pregenerate -- --reindex`（补缺）/ `--reindex-all`（口径变更后全量重算）。
8. ✅ 调参：阈值定为 0.35（见 §7 实测）。

---

## 8.1 设计原则：库是"样本"，不枚举属性维度

素材库是**代表性样本 / 复用缓存**，不是穷举目录。**manifest 不要枚举属性维度**
（人种、性别、颜色、风格、季节…）—— 那会组合爆炸，是"无限膨胀"坑在生成层的重演。

长尾的属性组合（"亚洲女性头像"、"女士红色连衣裙"）靠 **描述驱动的生成兜底 + 自动入库**
覆盖：模板 asset 没命中阈值时按其描述现生一张 → 落 `generated/<templateId>/` →
下次 `syncFromDisk`/启动自动算 embedding 入库（§10.4 复用顺序的末端 + §10.5 同步）。
于是**库会随真实用到的需求自我填充**，无需预先穷举。

所以：manifest 只放常见主体的广度样本；要某个具体属性，就让 asset 描述写明它，
交给"现生 + 自动入库"，而不是去 manifest 里加一个维度。

## 9. 一句话总结

> **大类**数量有界、放数据库小表、可实时改；**细粒度语义匹配**用 **embedding 向量 + 余弦最近邻**，彻底取消会无限膨胀的关键词词典。embedding 只在入库算一次、查询算一次，成本可忽略，且天然支持没见过的新词。所有改动都藏在已有的 `findByIndex` 扩展点背后，调用方零改动。

---

## 10. 实际执行流程（已实现，逐步）

以下是代码里 embedding **真正怎么跑**的细节。涉及文件：
`text-embedding.ts`、`asset-library.service.ts`、`pooled-template-asset-store.ts`、
`template-asset.service.ts`、`config/config.factory.ts`、
`scripts/{pregenerate-asset-library,import-existing-assets,asset-library-manifest}.ts`。

### 10.0 配置加载（启动时一次）

`ConfigFactory.build()` 读 `AI_EMBEDDING_MODEL` → `config.ai.models.embedding`
（`AI_PROVIDER=openai` 时默认 `text-embedding-3-small`，其它 provider 不默认）。
`AssetLibraryService` 注入 `ConfigService` 拿到它；未配则 `computeEmbedding` 返回 null、
全链路安全降级（不命中、回退生图）。

### 10.1 `embedText` —— 算一个归一化向量（最底层）

```
embedText({ apiKey, baseUrl, model }, text):
  openai.embeddings.create({ model, input: text })   // HTTP POST /v1/embeddings
  vec = resp.data[0].embedding                         // number[]，text-embedding-3-small = 1536 维
  return normalizeVector(vec)                          // 除以模长 → 单位向量
```

`normalizeVector(v) = v / sqrt(Σ vᵢ²)`（零向量原样返回）。
归一化是为了让后续**点积 `dot(a,b)` 直接等于余弦相似度**，省掉每次比较再算模长。

### 10.2 入库执行流程（预生成 / 登记）

**A) 预生成 `pregenerateOne(spec)`**（`pnpm assets:pregenerate` 每条 manifest 走一遍）：
```
1. existsBySlug(spec.slug) ? -> 跳过（断点续跑）
2. generateImageBytes(...)  -> 调 OpenAI Images 拿 PNG 字节
3. storeToPool(category, slug, bytes)
       -> 写 public/template-assets/pool/<category>/<slug>.png
       -> 返回 { url: '/template-assets/pool/...', storageKey }
4. text = buildEmbeddingText({ alt, keywords, prompt })   // ⚠️ 只主体语义，无 role/category
5. embedding = computeEmbedding(text)   // = embedText(...)，失败/未配 -> null
6. repo.save({ slug, category, keywords, role, alt, url, storageKey, embedding })
```

**B) 登记已有图 `registerExisting(params)`**（`pnpm assets:import-existing`，不生图）：
扫 `public/template-assets/generated/**`，从文件名推断 role/主体 →
`text = buildEmbeddingText({ alt, keywords })` → `embedding = computeEmbedding(text)` →
`repo.save({...url 指向现有图..., embedding })`。

> 关键：`buildEmbeddingText` 是**入库与查询共用的唯一拼接口径**，只拼
> `alt + keywords + prompt`（纯主体），保证两边向量在同一语义空间、可比。

### 10.3 查询 / 匹配执行流程（模板生成时）

调用链：
```
模板生成 -> resolveVisualAsset(asset)
          -> store.findByIndex(context)              // PooledTemplateAssetStore
          -> AssetLibraryService.findBestMatch(context)
```
`findBestMatch(context)` 内部：
```
1. rows = repo.find()         // 全量读出（几百~几千行，内存里算即可）
   rows 空 -> return null
2. qText = buildEmbeddingText({ alt, keywords, prompt })   // 与入库同口径
   qVec  = computeEmbedding(qText)
   qVec 为 null（未配模型/失败）-> return null（回退生图）
3. for img in rows (跳过没 embedding 的):
       sim  = dot(qVec, img.embedding)                       // 余弦相似度
       rank = sim + (context.role===img.role ? 0.05 : 0)     // 同 role 仅排序加分
       维护 rank 最高者 best（同分按 slug 字典序，确定性）
4. best 的「原始 sim」 >= MATCH_THRESHOLD(0.35) ?
       是 -> 打日志「命中复用 <slug> 相似度 x.xxx」，return { url, storageKey }（跳过生图）
       否 -> return null
5. 上层 resolveVisualAsset 收到 null -> 走占位符 / 调 AI 生图（并 save 新图，附带其 embedding）
```
注意阈值 gate 用的是**原始相似度**，role 加分只决定"同分里选谁"，不会把不够像的拉过线。

### 10.4 复用顺序（resolveVisualAsset 全景）

```
asset.url 合法 ──► 直接用
provider=placeholder ──► 占位符
store.findExisting(templateId,assetId) 命中 ──► 精确复用（免费）
store.findByIndex(context) 命中 ──► 语义复用（本节，免费）★
占位符模式开关 ──► 占位符
否则 ──► 调 AI 生图 ──► store.save(...) 顺带算并存 embedding（下次可被复用）
```
"免费复用永远优先于付费生图"。

### 10.5 重算（口径/模型变更后）

`reindexMissing(force)`：遍历全表，对 `embedding` 为空（或 `force=true` 全部）的行，
用当前 `buildEmbeddingText` 口径重算并 `repo.save`。
CLI：`pnpm assets:pregenerate -- --reindex`（仅补缺）/ `-- --reindex-all`（全量重算）。
**任何时候改了 `buildEmbeddingText` 的拼法或换了 embedding 模型，必须 `--reindex-all`**，
否则旧向量和新查询向量不在同一空间、相似度失真。

### 10.6 成本与性能

- 每张图入库：1 次 embedding 调用（~$0.0000004）；查询：每个 asset 1 次。相对图片生成（~$0.04）可忽略。
- 匹配是内存里 O(N) 点积，N=几百~几千时亚毫秒级。N 上万再考虑 pgvector / sqlite-vss 的近邻索引（换 `findBestMatch` 实现即可，接口不变）。
