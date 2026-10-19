---
milestone: M002
version: M002-BE-PRON-01
status: proposed
date: 2026-10-16
---

# 发音边界合同

本稿仅维护Markdown，不生成OpenAPI。API-401是外部FreeDictionary调用合同；API-402是客户端浏览器语音能力合同，**均不是新增 `/api/v1` 后端端点**。总体决策、尚未解决的资源使用条件和真实播放验证见[后端方案](../backend.md)。

## API-401：FreeDictionary词条及录音

### 范围与权限

CAP-401/402/403，DATA-401/402/404，PAGE-402/403。调用者为已合法显示当前词的客户端；所有权益相同，无项目Key/登录/造文额度门槛。不能通过本合同查询私人文章。仅用户点击触发，不在SSR或卡片挂载时请求。

### 请求

`GET https://api.dictionaryapi.dev/api/v2/entries/en/{encodedEntry}`

| 输入 | 约束 |
| --- | --- |
| `entry` | 必须来自当前卡片、非空、至多128个Unicode码点；保留原词作为播放目标。边界拒绝控制字符、换行及URL形式输入；允许既有词条中的空格、连字符/撇号，不对所有词强制仅a-z |
| 路径编码 | 对完整entry作单一路径段percent-encoding；禁止字符串拼接可改变主机/路径的原始值；不回写规范化后的值到卡片 |
| Headers / RequestInit | Accept为JSON；credentials omit；referrerPolicy no-referrer；redirect error；不附cookie、Authorization、CSRF、账号或生成请求ID |
| Body / Query | 无；不发送释义、用法、文章、模型名或用户资料 |
| 期限 | 2.5秒覆盖请求、响应读取和解析；以当前尝试的AbortController和截止时间执行；重播先取消上一尝试 |

响应读取最多256KiB（解码后的字节流也限额，不只信Content-Length），超过立即取消并归为不可用。只接受2xx JSON数组；生产采用守卫式读取需要的字段，忽略未知字段而不把第三方结构直接绑定到界面。

### 外部成功响应与适配

官方结构含 `word` 与 `phonetics[]`，后者可能只有text或空audio；当前实测额外含资源级 `sourceUrl/license`。不得把示例当完整供应商保证。[官方接口说明](https://dictionaryapi.dev/)

内部规范化结果的最小合同：

| 字段 | 类型 / 含义 |
| --- | --- |
| `entry` | string，本次请求的原词；第三方 `word` 仅用trim+大小写折叠核对同词，不能替换它 |
| `candidates` | 数组；仅当前匹配词下通过安全校验、非空且去重的音频候选，最多8项作为资源上限，不承诺全部可播 |
| `audioUrl` | string，固定HTTPS允许域名和路径前缀，无userinfo/query/fragment/非标准port；禁止站外跳转 |
| `locale` | string或null；仅可靠地区元数据可赋值；本轮样本为null，不根据 `-uk.mp3` 等文件名猜测 |
| `sourceUrl` | string或null；原资源来源，作为元数据保留，不触发另一服务请求；渲染前单独校验 |
| `license` | `{name: string, url: string}`或null；取该phonetic的许可，不能借用词条顶层许可推定音频可用 |

`candidates` 是资源发现结果，**不是使用条件已经获准的标记**。OPEN-401未闭环时不得通过名称字符串白名单自动放行或宣称可上线。生产适配/播放的完成条件包含资源使用说明的落实；没有信息不能伪造作者或许可，也不偷偷排除所有词典资源后宣称双路径完成。

示例仅演示字段含义，不作为许可放行fixture：

```json
{
  "entry": "hello",
  "candidates": [{
    "audioUrl": "https://api.dictionaryapi.dev/media/pronunciations/en/hello-uk.mp3",
    "locale": null,
    "sourceUrl": "https://commons.wikimedia.org/w/index.php?curid=9021983",
    "license": {"name": "BY 3.0 US", "url": "https://creativecommons.org/licenses/by/3.0/us"}
  }]
}
```

### 录音请求

由已选候选中的 `audioUrl` 发起GET；外部请求仍使用credentials omit、no-referrer、redirect error。建议fetch Blob播放，下载至播放开始共享2.5秒预算；不在下载完成后重新获得完整2.5秒。最大1MiB，允许音频MIME（如audio/mpeg、audio/ogg、audio/wav），拒绝HTML/JSON等类型；解码失败按媒体失败处理。上限为待审的资源边界，非实测分布，实施中对合法样本不足须有据修订。

Blob对象URL仅为本地媒体播放句柄，不是允许任意外部data/blob输入。结束、失败、取消、词卡失效时revoke；不缓存到磁盘/Service Worker。不能设置浏览器无法设置的Referer头来“伪造隐私”，应使用fetch的referrerPolicy。若服务不支持匿名CORS，明确作为该路径不可用，未经技术修订不退回有凭据或泄露referer的方式。

### 错误与本地结果分类

以下kind属于客户端合同，不是新增后端HTTP错误码。

| kind | 上游状态/条件 | 处理 |
| --- | --- | --- |
| `no_audio` | 404、空数组、没有匹配词、仅空audio | 本尝试进入浏览器路径一次 |
| `rate_limited` | 429 | 结束该词典尝试，不自动重试、不创建等待队列；尝试浏览器 |
| `unavailable` | 其他非2xx、网络/CORS/超时、坏JSON/结构、超限、危险URL或格式 | 尽快取消相关工作，尝试浏览器；不把上游错误正文原样显示 |
| `media_failed` | 下载/解码/播放错误、媒体play被拒绝或期限到达 | 清理媒体后尝试浏览器一次；不能因媒体手势受限而省略已约定的兜底尝试 |
| `gesture_required` | 已进入浏览器兜底，语音启动因用户手势受限 | 原位重试图标；下一次点击直接继续浏览器路径，不循环回到词典查词 |
| `cancelled` | 用户新意图/词卡移除/离开/会话失效 | 丢弃所有迟到结果，**不回退、不计为播放成功** |

手动重试是新的用户意图；同词可复用当前卡片仍有效的候选，不复用失败资源。没有服务端幂等键、写入、分页或后台任务；供应商结果可能改变，不保证重复GET内容相同。

## API-402：浏览器朗读能力（非HTTP）

关联CAP-402/403/404，DATA-401/403/404，PAGE-402/403。使用浏览器标准 `speechSynthesis.getVoices()`、`SpeechSynthesisUtterance`、`speak()`、`cancel()`；无需Google SDK或项目端点。[声音列表](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/getVoices)、[取消语义](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/cancel)

输入：当前entry、可选的用户明确选择口音、当前页面/尝试令牌。entry只读原卡片。输出事件：实际 `started`、`ended`、`failed`、`gesture_required`、`cancelled`；没有英语声音是合法失败。

- 没选口音时：当前可用英语声音中优先设备默认英语声音，其次稳定选择一项；不写账号偏好，不要求某厂商voice name。
- 已选口音时：仅匹配实际语言地区；只有其他英语声音则进入现有口音替代交互，由用户确认；不得伪报原口音。
- 声音列表可能稍后到达；首次读取和voiceschanged采用有限等待。清理监听，不能反复延长截止时间。确切voice-ready/start/end期限及支持设备由OPEN-403接收后补齐。
- `speak()`可能排队，必须由页面单一协调器负责调用和取消；不能每个词卡各自无协调地speak。旧事件只在令牌有效时更新当前控件。
- 仅真实开始事件才显示播放中，结束事件才显示完成；调用方法成功不等于用户听见声音。浏览器服务可能本地或远程，不承诺离线。[localService](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice/localService)
- 需要再次手势时，点击直接尝试已选浏览器语音；不要重新触发词典请求。HTML媒体类似地依据play Promise成功/失败处理，不能提前显示已播放。[MDN播放限制](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play)

## 兼容、实现与验证

无既有后端DTO、生成SSE或保存接口版本变化，不实现旧版适配。新客户端适配器、控件与状态归属由frontend-bob明确；后台管理台、选词、explore及复习不因组件复用增加入口。

确定性测试应覆盖所有本地kind、成功与空资源、迟到回调、取消不回退、真实口音/未知口音和手势；Mock只能证明合同，不能替代网络、许可和声音证据。本轮探测与尚未完成的BE401-V1～V6见[主方案](../backend.md)。
