# AC-321 两个真实完整请求的独立评阅

两次请求均使用唯一授权模型 `deepseek/deepseek-v4-flash-0731`、`json_schema` 和 `{"reasoning":{"enabled":false}}`，输入均为 `machine / preclude / interim / juvenile / retroactive`、中文释义、Story、Brief。没有 probe、独立 planning 或第三次重跑替代完整业务请求。

## R1 游客基础链

- 终态：`basic V1`，原生有效，status `can_save=true`；游客额度 100→99，charge `consumed`。
- 时序：首个 scene plan item 7.722s；首个 word 释义/用法 plan item到达时间 **unknown**；全部五词 plan items 完成时间 **unknown**（SSE 确有 scene+5 共6项，但本轮脚本未逐项持久化时间，不重跑）；首可见正文 14.159s；总计 21.362s。
- 调用：planning 1、generation 1；technical repair 0、fixed edit 0、content review 0、content repair 0。
- usage/cost：input 3,531、output 788；`0.00026810 + 0.00041496 = 0.00068306 openrouter_credits`。
- 内容：包装机临时密封件的短故事成立。`machine`、`interim seal`、`retroactive approval` 自然；`precludes shipping ... before then` 可理解但略机械；屋顶幼鸟是语义成立但与维修主线联系偏弱的插曲。结论为技术链 PASS、内容有轻微牵强观察，不外推成功率。

## R2 Pro 增强链

- 终态：`review_passed V2`，原生有效，status `can_save=true`；Pro 额度 97→96，charge `consumed`。
- 时序：首个 scene plan item 8.802s；首个 word 释义/用法 plan item到达时间 **unknown**；全部五词 plan items 完成时间 **unknown**（同上）；首可见正文 17.536s；总计 35.788s。
- 调用：planning 1、generation 1、fixed edit 1、content review 1；technical repair 0、content repair 0。审校原生安全结果为 `pass`、`reason_codes=[]`，没有私有推理正文。
- usage/cost：input 8,135、output 1,449；`0.000291530 + 0.000223182 + 0.000458120 + 0.000097440 = 0.001070272 openrouter_credits`。
- 内容：机器维修 Story/Brief 外形成立；`machine`、`preclude` 基本自然，`interim repair funds` 稍生硬。`starting retroactively` 搭配不自然；把新零件的磨合期类比为 `juvenile birds` 明显牵强且常识关系不成立。增强审校漏判，内容质量 FAIL，见 CR-308。

## 有界观察率

- 完整真实请求分母 2：技术原生有效 2/2；本数字只描述这两个请求，不是质量成功率。
- 增强审校请求分母 1：审校 `pass` 1/1，内容返修触发 0/1，但独立评阅发现明显漏判 1/1。
- 固定编辑 1 次；基础 technical repair 0 次；内容 repair 0 次。没有 forced/contradiction 持久化 reason，因此数据库触发频率为 0/1；独立 QA 的漏判观察不能伪写成已触发 reason。
- 第三次真实请求未执行。`AI-QUALITY-90` 继续 UNVERIFIED。
