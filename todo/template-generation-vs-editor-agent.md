# 一句话生成模板：和编辑 Agent 分开

## 结论

「一句话生成完整模板」不要从现在的编辑 Agent 上扩出来。它应该继续作为独立模块，入口只用后端的 `backend/src/ai-templates`。

生成完成后，把保存好的 `ThemeLayoutDocument` 交给编辑 Agent。用户之后说「把价格改成 99」，才走修改现有模板这条路。

两边可以共用模型配置、QueryLoop、文档校验和前端输出流。不要共用工具，也不要共用节点身份规则。

## 现在的两条路

### 改现有模板

- 入口：编辑器里的对话，`POST /api/ai/editor`。
- 实现：`backend/src/ai` 里的编辑 QueryLoop。
- 输入：已经打开的模板，加上用户的修改要求。
- 工具：检索已有节点、改属性、插入、移动、删除。
- 产物：针对当前画布的一小批操作。
- 约束：已有节点的 ID 必须来自文档。对不上就不下发。

### 生成完整模板

网站上已经有这个功能：用户给一句话，系统要交出一份完整模板，包含页面和全部组件。

这条路目前有两套实现：

1. 后端四段流水线，模块在 `backend/src/ai-templates`。
   - Designer：把提示词收成设计 brief。
   - Critic：和已有模板比差异，避免做成同一张皮。
   - Schema：一次提交完整的 `ThemeLayoutDocument`。
   - Verifier：检查这份文档能不能用。
2. 前端 `src/ai/agents/templateGenerationAgent.ts`。
   - 只暴露一次 `generate_template`。
   - 编辑器页面 `src/views/EditorPage/useEditorPageController.ts` 会走到 `templateAiService.generate()`。

两套生成同时存在，产品行为会对不齐。一句话生成应只留后端那条。

## 为什么不能扩编辑 Agent

两边的约束是反的。

改模板时，模型只能碰树上已经存在的节点。身份由代码绑定，写错 ID 就不能下发。

生成模板时，树上还没有节点。模型必须自己造出页面、组件、样式和可复用模板。ID 在这一步本来就可以是新的。

如果把生成塞进编辑循环：

- 模型会继续用「改已有节点」的工具凭空写 ID。
- 编辑器那套身份校验会把这次生成拦掉。
- 或者校验放行，把一份半成品写进正在打开的画布。

所以生成不是编辑 Agent 的一种模式，而是编辑开始之前的另一次任务。

## 建议怎么改

1. 保留 `backend/src/ai-templates` 作为唯一的生成模块。网站上的一句话生成只调它。
2. 前端不再用 `TemplateGenerationAgent` 自己跑一轮 `generate_template`。前端只提交提示词、展示流水线进度，并在模板保存后打开它。
3. 生成模块的产物是一份通过校验的完整文档，并写入模板库。不要在生成过程中对某个已打开画布做局部补丁。
4. 用户打开这份模板之后，后续对话全部进入现有编辑 Agent。编辑 Agent 继续只负责检索和修改已有节点。
5. 共用层只放这些东西：
   - 模型与供应商配置
   - QueryLoop
   - `ThemeLayoutDocument` 校验
   - 前端 SSE 输出流
6. 不共用这些东西：
   - 编辑工具（`editor_search_nodes`、`editor_update_props` 等）
   - 节点身份门禁（已有节点必须精确命中）
   - 编辑器的澄清和 `Resolved target`

## 这次先不做

- 不把生成流水线拆进编辑器的工具循环。
- 不让生成阶段复用「禁止自创节点 ID」的规则。新文档里的 ID 由生成器创建，保存之后才变成编辑器必须遵守的真实 ID。
- 不在这一步重写 Designer、Critic、Schema、Verifier 的提示词。先把入口收成一条。
