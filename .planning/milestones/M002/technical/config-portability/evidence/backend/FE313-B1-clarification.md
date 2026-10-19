---
id: FE313-B1
milestone: M002
agent_name: backend-alex
status: proposed_frontend_reception_supplement
source_version: M002-BE-CR313-01
date: 2026-10-15
scope: API-502 warnings/defaults_applied representation only
---

# FE313-B1：预览提示的类型补充

这是原作者为frontend-bob提供的窄接收补充，**待随前端方案审阅**，不是重新启用后端阶段或新的方案审批。已批准的[API-502原文](../../api.md)、其余五份冻结文档、应用和控制面均不改。本补充只把既有`{code,item_ref,field}`说明补齐为可解码结构，不新增业务行为、必填项、阻止条件或确认步骤。

依据：[产品可选字段语义](../../../../product/config-portability.md#fields)与原API的Change身份/FILE502规范化规则。warnings是既有影响的说明，defaults_applied是既有可选字段规则实际采用后的说明；两者都不能替代can_commit、blockers、changes和effects。

## 类型与空值

```ts
type ItemRef = {
  kind: 'connection' | 'model' | 'plan' | 'item' |
        'checkin' | 'mastery' | 'level' | 'achievement';
  identity: string;
};
type PreviewNotice = {
  code: string;
  item_ref: ItemRef | null;
  field: string | null;
};
// API-502 data中的两个必填字段：
// warnings: PreviewNotice[]
// defaults_applied: PreviewNotice[]
```

- 两个数组必出现，不接受null；无条目返回`[]`。每条恰有code、item_ref、field三个必填键，不能省略或用undefined代替null。
- item_ref非null时恰含kind/identity，不含label、category、数据库行号或任意payload。组合必须匹配本次changes中的一个对象（包括unchanged）；名称从该Change.label取，不从文件自由文本重新寻找对象。该组合也作为定位键，不能只用identity跨kind匹配。
- identity严格沿原Change：connection/model/item/achievement为非零规范UUID；plan为visitor/basic/pro/plus；checkin固定`current-intent`；mastery固定`mastery`；level为`level:N`，N为1～2147483647的规范十进制正整数。不得使用源level UUID代替目标等级业务身份。
- warnings允许item_ref=null，表示整个所选类别的说明；此时field必须null。有对象但不针对一个字段时field也为null。
- defaults_applied每条必须有非null item_ref及非null field。每个默认说明都可定位到规范化对象字段；无源pending时定位checkin对象，不用类别级null占位。
- field非null时是**相对该对象的FILE502 JSON Pointer**，非上传文件全文指针。例如connection `/name`、model `/display_name`、item `/description/zh_CN`、level `/reward/item_definition_id`、checkin `/pending`。仅使用当前schema已知字段/语言键，不含api_key/口令/密文字段路径、动态custom_parameters子键、源数组索引或用户构造片段。空字符串不作为field，整项提示用null。
- 缺键、null不符合上述规则、引用未匹配Change、identity非法或field不在对应kind的字段白名单，均属响应合同错误。前端不猜字段、不把解析失败转换成允许提交。

## code解码与首版已知代码

code是必填非空ASCII标识，匹配`^[a-z][a-z0-9_]{0,63}$`。**结构严格、信息提示code可扩展**：前端验证上述格式后，已知code使用本地文案；未知但格式合法的code保留为unknown notice，使用通用文案和已有对象/字段定位，不直接展示code原文，也不因此丢弃整份合法预览。它不得开启提交、解除blocker或推断新的默认值。未知code没有对应已批准业务语义时，后端不得借此添加新的规范化或阻止规则；真正变更仍走原合同流程。

首版后端使用下表已知代码；field决定同一通用code的具体字段，不为每种可选字段另造状态机。

| 所在数组 / code | 现有语义及合法定位 |
|---|---|
| defaults_applied / `name_generated` | connection `/name`按host生成；model `/display_name`按模型标识前200字符生成。对应生成后的显示名称已由Change.label承载，不增加值字段。 |
| defaults_applied / `optional_value_cleared` | model `/description`或`/max_output_tokens`；item `/name/zh_CN`、`/name/en_US`、`/description/zh_CN`、`/description/en_US`；achievement `/name/zh_CN`、`/name/en_US`、`/title/zh_CN`、`/title/en_US`、`/description/zh_CN`、`/description/en_US`；level/achievement `/reward/item_definition_id`。省略或允许的null/空白按产品清空，绝不继承目标旧值。achievement整组description省略/null时分别定位两个语言槽。 |
| defaults_applied / `reward_quantity_zero` | level/achievement `/reward/item_count`；无道具且数量省略时规范为0。明确0是输入值，不因其为0生成此默认说明；有道具缺数量仍是错误，不能使用此code补0。 |
| defaults_applied / `checkin_current_selected` | checkin `/pending`；源pending省略/null，明确采用完整current设目标下一学习日。实际来源/日期仍读取effects.checkin_source/checkin_effective_day，不从code推算。 |
| warnings / `language_fallback` | item的name/description或achievement的name/title/description中，一个语言槽为空、另一槽有内容；item_ref指该对象，field指缺失的语言槽。仅解释既有显示回退，不补造或持久化译文。 |
| warnings / `plan_no_models` | plan `/model_ids`明确空数组，显示无模型选项影响。 |
| warnings / `plan_no_lengths` | plan `/allowed_lengths`明确空数组，显示无长度选项影响。 |
| warnings / `category_cleared` | item_ref=null、field=null；已有合法清空预览说明，是否可提交仍完全取can_commit/blockers。 |
| warnings / `effective_plan_may_change` | item_ref=null、field=null；解释effects.may_change_effective_plan=true。 |
| warnings / `level_may_downgrade` | item_ref=null、field=null；解释effects.may_downgrade=true。 |

上述code仅命名既有信息，不要求额外确认动作。defaults_applied描述规则被采用，即使目标本来已为空也可对应unchanged对象；它不是新增/更新计数。不得给必填false/0、显式null无限额度、显式空模型/长度集合生成“自动补值”说明。名称自动生成、可选清空、无奖励和签到current来源仍按原产品/FILE502执行；未知code通用提示不能作为计算它们的依据。

## 安全来源与前端处理

code由服务端固定词表/受控代码生成，item_ref来自已验证规范命令及精确目标映射，field来自schema白名单。任何一个都不得取API Key、口令、密文、Key指纹、任意JSON键名、SQL错误、用户身份或个人历史。提示结构无额外value/before/after/message字段；非秘密具体变化仍用Change.fields，影响人数/生效日用effects，名称用Change.label。前端文本渲染并沿已批准设计文案，不插入HTML。

未知合法code的通用说明可以表达“此项还有配置提示，请核对预览”，定位仍使用已验证item_ref/field；不得展示未知原始字符串或臆测其含义。warnings/defaults_applied不承担业务阻止；任何必须阻止提交的情况仍由原can_commit/blockers合同表达。

成长类别安全示例（示例identity必须在同一响应changes中出现）：

```json
{
  "warnings": [
    {"code":"level_may_downgrade","item_ref":null,"field":null}
  ],
  "defaults_applied": [
    {"code":"reward_quantity_zero","item_ref":{"kind":"level","identity":"level:2"},"field":"/reward/item_count"},
    {"code":"checkin_current_selected","item_ref":{"kind":"checkin","identity":"current-intent"},"field":"/pending"}
  ]
}
```

本轮仅定向读取原合同/产品并编写此补充，未运行测试或服务。原六文件hash不更新；本文件不是冻结BE01交付清单的替代版本。frontend-bob可将本补充作为FE313-B1类型来源引用，随前端方案审阅。
