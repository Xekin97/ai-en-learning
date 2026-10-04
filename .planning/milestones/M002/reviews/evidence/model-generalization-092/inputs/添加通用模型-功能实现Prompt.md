# 功能实现 Prompt：添加通用模型（BYOK 自定义模型）

> 用法：将本 Prompt 完整粘贴给实现方（工程师或编码 Agent），作为「添加通用模型」功能的唯一需求来源。所有字段名、路径、校验规则以 MiMo Desktop / MiMoCode 现有模型配置为权威参考，不要自行发明 schema。

---

## 1. 背景与目标

MiMo Desktop 的 **设置 → 模型 / Providers** 目前提供：

- 默认模型选择
- BYOK 自定义模型：用户填入 **模型名称** 与 **以 `/v1` 结尾的 baseURL**，即可接入自有或第三方模型端点

本任务是把「**添加通用模型**」做成完整可交付的产品能力：用户能在设置中注册任意 OpenAI 兼容（或 Anthropic 兼容）端点，注册后立即出现在模型选择器中，可用于对话与 Agent 调用。

**成功标准：** 用户填好连接信息 → 保存 → 模型选择器出现该模型 → 发起一次对话能正常请求到该端点。

---

## 2. 参考实现（权威数据模型）

### 2.1 全局配置文件

路径：`~/.config/mimocode/mimocode.jsonc`（或 `mimocode.json`；后加载者优先）。项目级配置 `.mimocode/mimocode.json(c)` 可覆盖全局，但「添加通用模型」默认写入 **全局配置**。

自定义 Provider 的标准写法：

```jsonc
{
  "$schema": "https://mimo.xiaomi.com/mimocode/config.json",
  "model": "custom/MODEL_ID",
  "provider": {
    "custom": {
      "name": "Custom",
      "npm": "@ai-sdk/openai-compatible",
      "only_configured_models": true,
      "models": {
        "MODEL_ID": {
          "name": "显示名称"
        }
      },
      "options": {
        "baseURL": "https://api.example.com/v1",
        "apiKey": "sk-..."
      }
    }
  }
}
```

### 2.2 字段硬性约束

| 约束 | 说明 |
|------|------|
| `npm` 适配器 | OpenAI 兼容端点必须用 `@ai-sdk/openai-compatible`（**不是** `@ai-sdk/compatible-openai`） |
| Anthropic 兼容 | 端点实现 Messages API（`POST /v1/messages`、`x-api-key`、`anthropic-version`）时用 `@ai-sdk/anthropic` |
| 字段命名 | 仅接受 `baseURL`、`apiKey`（camelCase）；`base_url` / `base-url` / `api_key` 均非法 |
| model key | `models` 下的 key 是 **原样发给上游的模型 ID**，保留大小写、`/`、标点；`name` 只是展示名 |
| 选择串格式 | `<providerID>/<modelID>`；只有第一个 `/` 是分隔符，modelID 内可含 `/` |
| baseURL | 原样保存；**不要**擅自增删或归一化 `/v1`。UI 提示「通常以 `/v1` 结尾」，但由用户最终确认 |
| `only_configured_models` | 自定义 Provider 必须 `true`，避免枚举上游未注册模型 |

### 2.3 模型选择状态文件

路径：`~/.local/state/mimocode/model.json`（`MIMOCODE_HOME` 非空时为 `$MIMOCODE_HOME/state/model.json`）。

```json
{
  "recent": [{ "providerID": "custom", "modelID": "MODEL_ID" }],
  "favorite": [],
  "variant": {}
}
```

新增模型保存成功后：把 `{providerID, modelID}` **插入 `recent` 最前**，去重同对，上限 10 条；**保留** `favorite`、`variant` 及其余顶层字段，禁止整文件覆盖重置。**不要**把 apiKey、baseURL、显示名写入此文件。

---

## 3. 功能范围

### 3.1 必须做（P0）

1. **添加通用模型入口**（设置 → 模型 / Providers → 添加自定义 / 通用模型）
2. **表单字段**（见 3.3）
3. **协议选择**：OpenAI 兼容 / Anthropic 兼容（二选一，映射到 `@ai-sdk/openai-compatible` / `@ai-sdk/anthropic`）
4. **保存**写入全局配置的 `provider` 段（最小化编辑，保留 JSONC 注释、`$schema` 及无关配置）
5. **校验**（见第 5 节）通过后写入 `model.json` 的 `recent`
6. **模型选择器**立刻可选到新模型
7. **编辑 / 删除**已添加的通用模型（删除需二次确认；删除后从选择器移除）
8. **设为默认**：用户显式选择时写顶层 `model`；仅「添加」时不改动当前默认
9. **密钥脱敏**：列表与日志中 API Key 显示为 `sk-****` 或「已配置」，支持「重新填写」

### 3.2 应该做（P1）

1. **测试连接**按钮：发起一次轻量请求（如 `GET /models` 或最小 chat）验证 baseURL + Key；失败给出可读错误（401/404/超时/非 JSON）
2. **同端点复用**：baseURL + 协议一致且密钥相同 → 追加模型到现有 Provider；密钥不同 → 新建 Provider ID（如 `custom-2`），避免静默覆盖其他模型共用的密钥
3. **Provider ID 冲突**：已有同名 Provider 但 options 不同 → 自动换短横线小写 ID，并同步更新 `model` / 白名单
4. **`enabled_providers` / `disabled_providers`**：新增 Provider ID 若被 disable，提供「启用并使用」操作
5. **快捷键/循环切换**可用：即写入 `recent` 的意义

### 3.3 表单字段定义

| 字段 | 必填 | 说明 |
|------|------|------|
| 显示名称 | 是 | 对应 `models.<id>.name`，用户可读 |
| Provider 名称 | 否 | 对应 `provider.<id>.name`，默认「Custom」或显示名称 |
| 模型 ID | 是 | 原样发给上游；禁止 trim 改写内部字符；可含 `/` |
| Base URL | 是 | 形如 `https://host/v1`；输入框 placeholder 提示以 `/v1` 结尾；不做自动补全 |
| API Key | 是* | *已有同 Provider 可选沿用；存储于 `options.apiKey` |
| API 协议 | 是 | OpenAI 兼容（默认）/ Anthropic 兼容 |
| 高级（可选） | 否 | `limit.context` / `limit.output` / `modalities` / `reasoning` / `tool_call`；**仅当用户填写时写入** |

### 3.4 明确不做

- 不根据模型名猜测 context 窗口、价格、是否支持工具调用/推理/多模态
- 不把 Anthropic 专用 header 加到 OpenAI Provider，反之亦然
- 不替用户改写 baseURL（含 `/v1`）
- 不在 UI、日志、导出、错误信息中明文回显 API Key
- 不为验证配置而发起计费业务请求（P1 的「测试连接」除外，且需用户主动点击）

---

## 4. UI / 交互要求

1. **入口**：设置 → 模型 / Providers → 「添加通用模型」主按钮；列表支持每行「编辑 / 设为默认 / 删除」
2. **表单校验即时反馈**：
   - Base URL 必须可解析为 `http(s)://`
   - 模型 ID 非空，允许 `/`
   - API Key 非空（或明确选择沿用）
3. **协议选择联动说明**：
   - 选 OpenAI 兼容 → 提示「适用于 Chat Completions / Responses 风格端点」
   - 选 Anthropic 兼容 → 提示「Base URL 填 API base（通常 `/v1`），不要填完整的 `/v1/messages`；适配器会自动拼 `/messages`」
4. **保存成功** Toast：「已添加 `custom/MODEL_ID`，可在模型选择器使用」；若设为默认需另附「已设为默认模型」
5. **失败态**：字段级错误 + 顶部摘要；不要清空用户已填内容
6. **空状态**：尚未添加通用模型时展示一句说明 + 添加按钮

### 4.1 UI 示意：设置 → 模型 / Providers（列表页）

布局要点：左栏为设置导航（「模型 / Providers」高亮）；右侧为主面板。主面板自上而下为页标题 → 默认模型区 → 自定义模型列表 → 主按钮。

```text
┌────────────────────┬──────────────────────────────────────────────────────────┐
│  设置              │  模型 / Providers                                         │
│                    │                                                          │
│  通用              │  默认模型                                                 │
│  外观              │  ┌────────────────────────────────────────────────────┐  │
│  个性化            │  │  MiMo V2.5 Pro          [更改]                     │  │
│  快捷键            │  └────────────────────────────────────────────────────┘  │
│  模型 / Providers ◀│                                                          │
│  MCP               │  通用模型（BYOK）                          [+ 添加通用模型]│
│  环境变量          │  ┌────────────────────────────────────────────────────┐  │
│  已归档            │  │ ★ DeepSeek Chat                                     │  │
│  关于              │  │   custom/deepseek-chat                              │  │
│                    │  │   https://api.deepseek.com/v1 · OpenAI 兼容         │  │
│                    │  │   API Key  sk-****…            [编辑][设为默认][删除]│  │
│                    │  ├────────────────────────────────────────────────────┤  │
│                    │  │   Claude Sonnet                                     │  │
│                    │  │   custom-anthropic/claude-sonnet-4-5                │  │
│                    │  │   https://api.example.com/v1 · Anthropic 兼容       │  │
│                    │  │   API Key  已配置               [编辑][设为默认][删除]│  │
│                    │  └────────────────────────────────────────────────────┘  │
│                    │                                                          │
└────────────────────┴──────────────────────────────────────────────────────────┘
```

| 元素 | 行为 |
|------|------|
| `★` | 当前默认模型标记；无默认时显示「未设置」 |
| 行内第二行 | 展示解析后的 `provider/model` 选择串（帮助用户对照配置） |
| 行内第三行 | `baseURL` 原样展示（不归一化 `/v1`）+ 协议徽标 |
| API Key | 列表中永远脱敏；「已配置」或 `sk-****` |
| 删除 | 二次确认弹窗：「删除后模型选择器将不再显示该模型，配置中的 API Key 会一并移除」 |

### 4.2 UI 示意：添加 / 编辑通用模型（右侧抽屉或模态）

宽度约 480px；标题切换「添加通用模型」/「编辑通用模型」。字段顺序固定，协议切换时只改下方说明文案与占位符，不改已填字段。

```text
┌──────────────────────────────────────────────┐
│  添加通用模型                            ✕   │
├──────────────────────────────────────────────┤
│  显示名称                                    │
│  ┌────────────────────────────────────────┐  │
│  │ DeepSeek Chat                          │  │
│  └────────────────────────────────────────┘  │
│  在选择器和列表中显示                          │
│                                              │
│  模型 ID                                     │
│  ┌────────────────────────────────────────┐  │
│  │ deepseek-chat                          │  │
│  └────────────────────────────────────────┘  │
│  原样发给上游，区分大小写；可含 /            │
│                                              │
│  API 协议                                    │
│  (•) OpenAI 兼容    ( ) Anthropic 兼容       │
│  适用于 Chat Completions / Responses 风格端点│
│                                              │
│  Base URL                                    │
│  ┌────────────────────────────────────────┐  │
│  │ https://api.deepseek.com/v1            │  │
│  └────────────────────────────────────────┘  │
│  通常以 /v1 结尾；不会自动补全或改写          │
│                                              │
│  API Key                                     │
│  ┌────────────────────────────────────────┐  │
│  │ sk-••••••••••••••••              [显示] │  │
│  └────────────────────────────────────────┘  │
│  仅保存在本机配置，界面与日志中脱敏            │
│                                              │
│  ▸ 高级选项（可选）                           │
│  ┌────────────────────────────────────────┐  │
│  │ [测试连接]          [取消]  [保存并使用] │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

**协议切换联动文案：**

| 协议 | 说明文案 | Base URL placeholder |
|------|----------|----------------------|
| OpenAI 兼容 | 适用于 Chat Completions / Responses 风格端点 | `https://api.example.com/v1` |
| Anthropic 兼容 | 填 API base（通常 `/v1`），不要填完整的 `/v1/messages`；适配器会自动拼 `/messages` | `https://api.example.com/v1` |

**高级选项（默认收起）：** 上下文长度 `limit.context`、输出上限 `limit.output`、输入模态（图片/音频/视频/PDF）。全部可空；空则不写入配置。

**按钮语义：**

| 按钮 | 行为 |
|------|------|
| 测试连接 | 用户主动触发的轻量探测（如 `GET /models`）；结果内联显示，不写配置 |
| 取消 | 关闭抽屉；二次确认仅当字段有未保存修改 |
| 保存并使用 | 保存配置 + 写入 `recent` + 可选设为默认 + 关闭抽屉 + Toast |
| 保存 | （编辑态）仅更新配置，不改当前默认 |

**表单错误示意（字段下方红字 + 顶部摘要条）：**

```text
┌──────────────────────────────────────────────┐
│ ⚠ 请修正 2 处标红字段后再保存                  │
├──────────────────────────────────────────────┤
│  Base URL                                    │
│  ┌────────────────────────────────────────┐  │
│  │ api.deepseek.com/v1                    │  │
│  └────────────────────────────────────────┘  │
│  ✗ Base URL 无效，应类似 https://api.example.com/v1 │
│  …                                           │
│  API Key                                     │
│  ✗ API Key 不能为空                           │
└──────────────────────────────────────────────┘
```

### 4.3 UI 示意：Composer 模型选择器

新模型保存后，选择器 **立即** 可见；「最近使用」由 `model.json` 的 `recent` 驱动，新条目置顶。

```text
┌──────────────────────────────────────────────┐
│  模型                                    ▲   │
├──────────────────────────────────────────────┤
│  最近使用                                    │
│  ● DeepSeek Chat                 custom/…    │ ← 新添加的通用模型
│  ○ MiMo V2.5 Pro                 xiaomi/…    │
│                                              │
│  通用模型（BYOK）                            │
│  ○ DeepSeek Chat                             │
│  ○ Claude Sonnet                             │
│  ─────────────────────────────────────────── │
│  + 添加通用模型…                              │ ← 跳转设置表单，保存后回填选中
├──────────────────────────────────────────────┤
│  官方模型                                    │
│  ○ MiMo V2.5 Pro                             │
│  ○ MiMo V2.5 Flash                           │
└──────────────────────────────────────────────┘
```

| 元素 | 行为 |
|------|------|
| `●` | 当前会话/默认选中 |
| `custom/…` | 第二列弱化显示选择串；完整 ID 放 tooltip |
| + 添加通用模型… | 打开 4.2 表单；保存成功后关闭菜单并选中新模型 |

### 4.4 空状态与 Toast

**列表空状态：**

```text
┌────────────────────────────────────────────────────┐
│                                                    │
│              还没有通用模型                          │
│   填入 OpenAI 或 Anthropic 兼容端点的 Base URL       │
│   与 API Key，即可在对话中使用你自己的模型。         │
│                                                    │
│                  [+ 添加通用模型]                   │
│                                                    │
└────────────────────────────────────────────────────┘
```

**成功 Toast（右下角，3s）：**

```text
┌────────────────────────────────────────────┐
│ ✓ 已添加 DeepSeek Chat                     │
│   custom/deepseek-chat 已可在模型选择器使用 │
└────────────────────────────────────────────┘
```

设为默认时追加一行：`✓ 已设为默认模型`。

### 4.5 视觉规范（示意即可，对齐 MiMo Desktop 既有设置页）

| Token | 取值方向 |
|-------|----------|
| 面板背景 | 设置页同级浅色/深色底（跟随主题） |
| 卡片/输入 | 比面板高一档的表面色 + 1px 描边 |
| 主按钮 | 品牌主色填充，高度 32–36px，圆角 8px |
| 危险操作 | 删除文案用红色；确认弹窗主按钮为红底 |
| 字号 | 标题 16–18px / 正文 13–14px / 辅助说明 12px |
| 密度 | 行高 ≥ 64px（三行信息）；表单字段间距 16px |

布局：设置窗口建议 ≥ 960×640；抽屉宽 440–520px；主内容区最大宽约 720px，左右留白 32px。

---

## 5. 校验规则（保存前必须全部通过）

| # | 规则 | 失败提示（示例） |
|---|------|------------------|
| 1 | 显示名称、模型 ID 非空 | 请填写显示名称 / 模型 ID |
| 2 | Base URL 为合法 http(s) URL | Base URL 无效，应类似 https://api.example.com/v1 |
| 3 | 协议与适配器映射正确 | 内部错误：协议与适配器不匹配 |
| 4 | `npm` 字符串精确匹配 | 内部错误：未知适配器 |
| 5 | 同 Provider 下 model key 不重复 | 该 Provider 下已存在同名模型 ID |
| 6 | Provider ID 唯一或复用策略命中 | （内部自动改名，不报给用户） |
| 7 | 若用户填写了 limit/模态，类型合法 | 上下文长度需为正整数 |

**保存后本地验证**（实现方自测）：

```sh
mimo models PROVIDER_ID
```

输出必须包含精确的 `PROVIDER_ID/MODEL_ID`。这证明配置可解析且模型已注册，**不**证明远端密钥可用。

---

## 6. 安全与隐私

1. API Key 视为密钥：不明文写入日志、错误上报、剪贴板分享、模型选择器 label
2. 配置文件权限尽量 `600`（Unix）
3. 若用户选择「不落盘明文」，支持 `apiKey: "{env:CUSTOM_API_KEY}"` 配置令牌，并提示需在进程环境中有该变量；**不要**在用户要求明文持久化时私自改成环境变量引用
4. 若对话中曾贴出真实 Key，完成后建议用户轮换
5. 删除模型时仅移除对应 `models` 条目；若该 Provider 下已无模型，一并移除 Provider；不误删其他 Provider

---

## 7. 边界情况

| 场景 | 期望行为 |
|------|----------|
| baseURL 多写/少写 `/v1` | 不自动纠正；「测试连接」失败时提示检查路径 |
| modelID 含 `/`（如 `xiaomi/mimo-v2.6-pro`） | 原样保存；选择串为 `custom/xiaomi/mimo-v2.6-pro`（仅首段是 provider） |
| 同 baseURL 不同 Key | 新建 Provider，不覆盖旧 Key |
| 配置文件含 JSONC 注释 | 最小化编辑，保留注释与无关键 |
| 已有 TUI/会话选中旧模型 | 提示需重新选择或新开会话 |
| 未知 context 窗口 | 省略 `limit`，不猜测 |
| Anthropic 端点填了完整 `/v1/messages` | 测试连接应失败并提示「填 API base，适配器会拼 /messages」 |

---

## 8. 验收清单

- [ ] 可添加 OpenAI 兼容通用模型，选择器立即可选
- [ ] 可添加 Anthropic 兼容通用模型，协议字段映射正确
- [ ] `mimocode.jsonc` 中生成的配置片段与第 2.1 节一致（含 `only_configured_models: true`、camelCase 字段）
- [ ] `model.json` 的 `recent` 含新模型，`favorite`/`variant` 未被清空
- [ ] 显示名 ≠ 模型 ID 时，列表与选择器显示 `name`，请求发 `modelID`
- [ ] API Key 在 UI 列表中脱敏
- [ ] 「设为默认」写顶层 `model`；「仅添加」不改默认
- [ ] 编辑、删除、删除确认可用
- [ ] 非法 URL / 空模型 ID 被拦截且不清空表单
- [ ] 本地 `mimo models <id>` 能列出新模型
- [ ] 日志与导出无明文 Key

---

## 9. 实现提示（给编码 Agent）

1. **先读后写**：只读 `~/.config/mimocode/mimocode.jsonc`（或既有最高优先级文件）与 `~/.local/state/mimocode/model.json`，做最小 JSONC 编辑，禁止整文件重写。
2. **字段名不得发明**：见 2.2；非 OpenAI 线协议必须换适配器，而不是硬塞 baseURL。
3. **不要猜测模型元数据**：显示名足够注册；缺 limit 时引擎会用运行时回退。
4. **验证与写 recent 顺序**：配置解析成功且 `mimo models` 确认后，再写 `model.json`。
5. **凭证处理**：任何输出、diff、summary 中不得出现 `apiKey` 明文；检查后打码。
6. **UI 与配置同源**：模型选择器读取配置解析结果，不要维护第二套模型列表。

---

## 10. 参考片段（可直接嵌入实现）

**仅添加（不改默认）：**

```jsonc
"provider": {
  "custom": {
    "name": "我的模型服务",
    "npm": "@ai-sdk/openai-compatible",
    "only_configured_models": true,
    "models": {
      "deepseek-chat": { "name": "DeepSeek Chat" }
    },
    "options": {
      "baseURL": "https://api.deepseek.com/v1",
      "apiKey": "REDACTED"
    }
  }
}
```

**设为默认时额外写顶层：**

```jsonc
"model": "custom/deepseek-chat"
```

**recent 追加（合并而非覆盖）：**

```json
{
  "recent": [
    { "providerID": "custom", "modelID": "deepseek-chat" }
  ],
  "favorite": [],
  "variant": {}
}
```
