# 13 · 华为云 MaaS 使用指南（D-21 详解）

> 回答用户问题：**MaaS 是什么、我们具体要做什么、实现细节。**
> 核实日期：**2026-10-14**（官方文档，见 §十一）
>
> 关联：`05`（技术架构）、`12` §5.3（双模型分工）、`04`（Agent 工具集）
> ⚠️ **MaaS 是“事务层”。它与全双工语音层的关系与分工见 [`14-语音层与Agent层分工.md`](14-语音层与Agent层分工.md)。**
> 一句话：**语音层不直接调 MaaS，而是调 `request_task` 工具，由后端转给 MaaS。**

---

## 一、MaaS 是什么

### 1.1 一句话

> **MaaS（Model as a Service，模型即服务）** 是华为云的一站式大模型**调用与托管**服务。
> 它把主流大模型（华为自家 + 第三方）预置好、免部署、按 Token 计费地开放出来，
> 我们**不需要自己买卡、部署、运维**，一个 HTTP 请求就能调用。

### 1.2 官方定义（原文）

> "MaaS（Model as a Service，模型即服务）是一种基于 AI 算力适配主流大模型的服务模式。
> 它作为企业与开发者的大模型敏捷应用枢纽，**免除了用户自行进行模型训练、部署与运维的高昂成本**，
> 提供灵活、低成本的按需调用方案。"

> "MaaS模型即服务，提供端到端的**大模型生产工具链和昇腾算力资源**，
> 并预置了当前主流的第三方开源大模型，支持大模型数据生产、微调、提示词工程、应用编排等功能。"

### 1.3 与我们已有技术的关系（**容易搞混，务必分清**）

```
华为云 AI 相关产品谱系
├── CodeArts 代码智能体（码道）   ← 【开发工具】赛题一强制：我们用它写代码
│        │
│        └─ 官方明确"兼容主流AI工具……支持华为云码道（CodeArts）代码智能体"
│           → MaaS 可以作为 CodeArts 的模型后端
│
├── MaaS 模型即服务              ← 【推理服务】我们要用的就是这个
│        · 预置模型，免部署，按 Token 计费
│        · OpenAI 兼容 API
│        · 支持工具调用 ✅
│
├── ModelArts                    ← 【训推平台】底层平台，MaaS 是它的一个能力面
│        · 需要"配置 ModelArts 委托授权"才能用 MaaS
│
└── SIS 语音交互服务             ← 【ASR/TTS】分段式，不是端到端（12 §五）
```

**结论**：MaaS = **我们的 Agent 推理引擎**。CodeArts = **我们的编码工具**。两者不是一回事，都要用。

### 1.4 为什么选 MaaS（四个理由）

| # | 理由 | 说明 |
|:--:|---|---|
| 1 | **赛题一的"华为云"技术栈体现** | 赛题一要求"基于华为云产品"，MaaS 是实打实的华为云产品 |
| 2 | **支持工具调用** | Agent 的命脉。MaaS 的 `tools` / `tool_choice` 是 OpenAI 兼容格式 |
| 3 | **有上下文缓存折扣** | 官方："特别适用于**多轮对话、工具调用**、角色扮演等需要多次传入相同内容的场景" —— **精确命中我们的场景** |
| 4 | **按需计费，不用不花钱** | 官方："不使用服务则不会产生费用"；且"内容生成失败不计费" |

---

## 二、可用模型清单（**仅"西南-贵阳一"区域**）

| 模型系列 | 模型名称 | `model` 参数值 | 工具调用 | 可关深度思考 |
|---|---|---|:--:|:--:|
| **openPangu** | openPangu-2.0-Pro | `openpangu-2.0-pro` | none/auto | ✅ |
| | openPangu-2.0-Flash | `openpangu-2.0-flash` | none/auto | ✅ |
| GLM | GLM-5.3 | `glm-5.3` | none/auto/**指定函数** | ❌ **只能 enabled** |
| | GLM-5.2 | `glm-5.2` | none/auto/指定函数 | ✅ |
| | GLM-5.2-ArkTS-SPARK | `glm-5.2-arkts-spark` | none/auto/指定函数 | ✅ |
| | GLM-5.1 | `glm-5.1` | none/auto/指定函数 | ✅ |
| Kimi | Kimi-K2.6 | `kimi-k2.6` | none/auto | ✅ |
| DeepSeek | DeepSeek-V4.1-Flash | `deepseek-v4.1-flash` | none/auto/**指定函数** | ✅ |
| | DeepSeek-V4-Flash | `deepseek-v4-flash` | none/auto/指定函数 | ✅ |
| Qwen3 | Qwen3-32B | `qwen3-32b` | — | ✅ |
| | Qwen3-30B-A3B | `qwen3-30b-a3b` | — | ✅ |

> 完整清单以 **MaaS 控制台 →「模型广场」** 为准。

---

## 三、⭐ 选型建议（**两条硬约束驱动的**）

### 3.1 约束一：`tool_choice` 支持度不同

| 模型 | 支持的 `tool_choice` |
|---|---|
| openPangu-2.0-Flash / Pro | `none` / `auto` |
| GLM-5.x | `none` / `auto` / **指定的函数** |
| Kimi-K2.6 | `none` / `auto` |
| DeepSeek-V4.x | `none` / `auto` / **指定的函数** |

**对 AgeGuard 的含义**：`04` §二 的工具集以 `auto` 为主（让模型自己判断是否建事项），
所以 openPangu 够用。但若将来需要"强制调用某工具"，openPangu 做不到 → 换 DeepSeek / GLM。

### 3.2 约束二：`thinking.type` 能否关闭（**这条更关键**）

| 模型 | 能否关掉深度思考 |
|---|:--:|
| openPangu-2.0-Flash / Pro | ✅ `enabled` / `disabled` |
| DeepSeek-V4.x | ✅ |
| GLM-5.2 / 5.1 / ArkTS-SPARK | ✅ |
| **GLM-5.3** | ❌ **`thinking.type` 只能是 `enabled`** |

**为什么关键**：AgeGuard 是**实时语音对话**场景，延迟是体验的核心。
深度思考（reasoning）会显著拉长首 Token 时间。
**GLM-5.3 强制开思考 → 不适合实时对话。**

### 3.3 ✅ 推荐的分工

> ⚠️ 注意：下表是 **MaaS 内部** 的模型分工（都是事务层）。
> **事务层与语音层的分工是另一回事** → 见 [`14`](14-语音层与Agent层分工.md) §六。

| 用途 | 模型 | 理由 |
|---|---|---|
| **实时对话 / 事项理解** | `openpangu-2.0-flash` | 可关思考 → 低延迟；auto 工具调用够用 |
| **复杂推理 / 多假设推断**（`04` §五） | `openpangu-2.0-pro` 或 `deepseek-v4.1-flash` | 需要更强推理；可开思考 |
| **记忆闲时整理**（`04` §3.3） | `deepseek-v4.1-flash` | 离线任务，成本敏感 |
| 语音通道 | **不在这里** —— 用 Qwen `qwen-audio-3.1-realtime-plus`（`12` §5.3） | 华为云无端到端实时语音 |

> ⭐ **用 openPangu 作为主模型，是"赛题契合度"与"技术可用性"的最佳交点**：
> 华为自家模型 + 可关思考 + 支持工具调用，三项都满足。

---

## 四、我们需要做的具体事项（**可执行清单**）

### 4.1 开通阶段（一次性）

| # | 动作 | 位置 | 注意 |
|:--:|---|---|---|
| 1 | 确认华为云账号已**实名认证** | 账号中心 | 必须 |
| 2 | **配置 ModelArts 委托授权** | ModelArts 控制台 | ⚠️ **不配这个用不了 MaaS** |
| 3 | 进入 **MaaS 控制台 → 模型广场** | MaaS 控制台 | 查看模型详情与定价 |
| 4 | **开通预置服务** | MaaS 控制台 | ⚠️ 见 §4.2 的三条约束 |
| 5 | 创建并保存 **API Key** | MaaS 控制台 | 等同密码，**绝不进客户端/仓库** |
| 6 | 记录 **Base URL** | — | `https://api.modelarts-maas.com/v2` |
| 7 | 选择计费方式 | 订阅管理 | 见 §七 |

### 4.2 ⚠️ 开通前必须知道的三条约束（官方原文）

> - 该功能**仅支持"西南-贵阳一"区域**。
> - 开通预置服务时，将**自动开通该服务下所有版本**，不支持单独开通某版本。
> - **暂不支持关闭预置服务。**
> - **目前三方服务仅支持个人用户开通。**

**逐条解读：**

| 约束 | 对 AgeGuard 的影响 |
|---|---|
| 仅"西南-贵阳一" | ⚠️ **与 `10` §二 的部署区域 `cn-north-4` 不一致**。应用在华北四，MaaS 在贵阳一 → **跨区域调用**，延迟会增加。需实测（T-28）；必要时把应用也放贵阳一（但与 RDS/Redis 同区域更优） |
| 自动开通所有版本 | 无法只开通 Flash；但按 Token 计费，**不调用不计费**，所以影响有限 |
| 暂不支持关闭预置服务 | ⚠️ 开通后**不能关**。但因为"不使用则不会产生费用"，只要不被别人调用就没事 → 务必妥善管理 API Key（`credential-security.md`） |
| 三方服务仅支持个人用户开通 | ✅ **利好**：openPangu 是一方，GLM/DeepSeek/Qwen3 是三方 → **个人用户就能开**，学生团队无障碍 |

### 4.3 开发阶段

| # | 动作 | 产出 |
|:--:|---|---|
| 8 | 用 `requests` 跑通一次非流式对话 | 验证 API Key / 区域 |
| 9 | 跑通流式（SSE） | 解析 `data: {...}` 与 `data: [DONE]` |
| 10 | **跑通工具调用**（照抄 §5.4 示例） | 验证 `tool_calls` 回传格式 |
| 11 | 实现 `MaaSProvider`（§六 骨架） | 对接 `04` 的 ReAct 主循环 |
| 12 | 测 `thinking.type=disabled` 的延迟差异 | 决定实时场景用哪个模型（T-29） |
| 13 | 测**缓存命中**效果与折扣 | 优化 prompt 结构（§5.5） |
| 14 | 接入 `web_search` 自建工具（`12` §四） | 绕开 Qwen 的搜索/FC 互斥 |

---

## 五、API 实现细节

### 5.1 基本信息

| 项 | 值 |
|---|---|
| API 地址 | `https://api.modelarts-maas.com/v2/chat/completions` |
| 鉴权 | `Authorization: Bearer $MaaS_API_KEY` |
| 协议 | **OpenAI 兼容**（`messages` / `stream` / `tools` / `tool_choice`） |
| 区域 | **仅"西南-贵阳一"** |

> ✅ **OpenAI 兼容是巨大的便利**：可以直接用 `openai` Python SDK，只需改 `base_url`。
> 但 MaaS 有若干扩展字段（`thinking.type`、`prefix`、`reasoning_content`），
> 用原生 `requests` 反而更灵活。建议**用 `httpx`/`requests` 自己写薄封装**（见 §六）。

### 5.2 请求参数（我们关心的）

| 参数 | 说明 |
|---|---|
| `model` | 如 `openpangu-2.0-flash` |
| `messages` | `system` / `user` / `assistant` / `tool` 四种 role |
| `stream` | `true` 返回 SSE |
| `tools` | 工具定义数组（OpenAI 格式） |
| `tool_choice` | `none` / `auto` / 指定函数（**取决于模型**） |
| `thinking.type` | `enabled` / `disabled`（**取决于模型**） |
| `prefix` | 前缀续写：在 assistant 消息上设 `"prefix": true` |

### 5.3 响应关键字段

| 字段 | 说明 |
|---|---|
| `choices[].finish_reason` | `stop` / `length` / **`tool_calls`** |
| `choices[].message.tool_calls[]` | 工具调用：`id` / `type`(仅`function`) / `function.name` / `function.arguments`(**JSON 字符串**) |
| `choices[].message.reasoning_content` | 思维链（仅深度思考模型返回） |
| `usage.prompt_tokens_details.cached_tokens` | **缓存命中的输入 token 数** ← 成本监控用 |
| `usage.completion_tokens_details.reasoning_tokens` | 思考消耗的 token 数 |
| `first_token_return_time` | **流式首 Token 返回时间** ← 延迟监控用 ⭐ |

> ⚠️ 官方明确提示：**"模型并不总是生成有效的 JSON，并且可能会虚构出一些您的函数参数规范中未定义的参数。
> 在调用函数之前，请在您的代码中验证这些参数是否有效。"**
> → 这直接对应 `04` §1 的**确定性校验层**：`arguments` 必须校验后才能执行。

### 5.4 工具调用完整示例（官方示例，已验证）

```python
import requests, json

url = "https://api.modelarts-maas.com/v2/chat/completions"
api_key = "MAAS_API_KEY"          # ← 从环境变量读，不要硬编码

headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {api_key}",
}

data = {
    "model": "glm-5.2",           # 或 openpangu-2.0-flash
    "stream": False,
    "messages": [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user",   "content": "北京今天天气怎么样？"},
        # ↓ 上一轮 assistant 返回的 tool_calls 原样带回
        {
            "role": "assistant",
            "reasoning_content": "The user is asking about the weather in Beijing today.",
            "content": "",
            "tool_calls": [{
                "id": "call_df646371a477403597ad63c4",
                "type": "function",
                "function": {
                    "name": "get_weather",
                    "arguments": "{\"city\": \"北京\", \"unit\": \"celsius\"}",
                },
            }],
        },
        # ↓ 我们执行工具后的结果回传
        {
            "role": "tool",
            "tool_call_id": "call_df646371a477403597ad63c4",
            "content": "{\"city\": \"北京\", \"temperature\": 26, \"unit\": \"celsius\", \"condition\": \"晴\"}",
        },
    ],
    "tools": [{
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "查询指定城市的实时天气",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {"type": "string", "description": "城市名称，例如：北京"},
                    "unit": {"type": "string", "enum": ["celsius", "fahrenheit"], "description": "温度单位"},
                },
                "required": ["city"],
            },
        },
    }],
    "tool_choice": "auto",
}

resp = requests.post(url, headers=headers, data=json.dumps(data))
print(resp.status_code, resp.text)
```

**ReAct 循环的对应关系（接 `04` §二）：**

```
① 发 messages + tools          → ② 若 finish_reason == "tool_calls"
                                    取出 tool_calls[].function.name / arguments
③ 校验 arguments（确定性层！）   → ④ 执行对应工具
⑤ 把 {role:"tool", tool_call_id, content} 追加到 messages
⑥ 再发一次                      → ⑦ finish_reason == "stop" 时返回最终回复
```

### 5.5 ⭐ 缓存命中优化（**省钱的关键，且官方点名适合我们**）

官方原文：

> "上下文缓存旨在优化您调用模型服务的体验……**命中缓存的输入享有折扣优惠**。
> 这一机制**特别适用于多轮对话、工具调用**、角色扮演等需要多次传入相同内容的场景。
> 该功能**无需额外配置**。用户发起请求时，系统会自动识别请求内容的**公共前缀**并进行缓存。"

**落地策略 —— 把 prompt 设计成"稳定前缀 + 变化后缀"：**

```
[ 稳定前缀 —— 尽量长、尽量不变 ]           ← 这一整段会被缓存
  ① system 人设（AgeGuard 的沟通原则、04 §4 的自适应策略）
  ② 工具定义（04 §二 的 12 个 tools，JSON schema 很长）
  ③ 老人画像摘要（记忆里的 preference，变化频率低）
[ 变化后缀 ]                                ← 不被缓存
  ④ 最近 N 轮对话
  ⑤ 当前这一句
  ⑥ 召回的长期记忆片段
```

**收益**：`usage.prompt_tokens_details.cached_tokens` 直接告诉你命中多少。
**必须监控这个指标**，否则白省钱。

> ⚠️ 官方也提示："缓存命中率**不确定**"，且未命中时"首 Token 时延可能会有一定程度的增加"。
> → 所以缓存是**成本优化**，不是延迟优化。实时对话的延迟要靠 `thinking.type=disabled` 控制。

---

## 六、Python 实现骨架

```python
# app/providers/llm.py
from dataclasses import dataclass
import os, json, httpx

MAAS_URL = "https://api.modelarts-maas.com/v2/chat/completions"

@dataclass
class LLMConfig:
    model: str = "openpangu-2.0-flash"   # 实时场景
    thinking: str = "disabled"           # 低延迟
    tool_choice: str = "auto"
    temperature: float = 0.3

class MaaSProvider:
    """华为云 MaaS。实现 04 §二 的 Agent 推理接口。"""

    def __init__(self, cfg: LLMConfig | None = None):
        self.cfg = cfg or LLMConfig()
        # ⚠️ API Key 只从环境变量读，绝不落盘/进仓库
        self._key = os.environ["MAAS_API_KEY"]

    @property
    def _headers(self):
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self._key}",
        }

    def _payload(self, messages, tools):
        p = {
            "model": self.cfg.model,
            "messages": messages,
            "stream": False,
            "temperature": self.cfg.temperature,
        }
        # 只有支持的模型才传 thinking（GLM-5.3 传 disabled 会失败）
        if self.cfg.thinking == "disabled":
            p["thinking"] = {"type": "disabled"}
        if tools:
            p["tools"] = tools
            p["tool_choice"] = self.cfg.tool_choice
        return p

    def chat(self, messages: list, tools: list | None = None) -> dict:
        with httpx.Client(timeout=60) as c:
            r = c.post(MAAS_URL, headers=self._headers,
                       json=self._payload(messages, tools))
            r.raise_for_status()
            return r.json()

    @staticmethod
    def usage_summary(resp: dict) -> dict:
        """把成本/延迟相关指标抽出来，接 07 的观测。"""
        u = resp.get("usage", {})
        return {
            "prompt_tokens":   u.get("prompt_tokens"),
            "completion_tokens": u.get("completion_tokens"),
            "cached_tokens":   u.get("prompt_tokens_details", {}).get("cached_tokens"),
            "reasoning_tokens": u.get("completion_tokens_details", {}).get("reasoning_tokens"),
        }
```

**ReAct 主循环（接 `04` §二）：**

```python
# app/agent/loop.py
from app.providers.llm import MaaSProvider
from app.agent.validate import validate_args      # ← 04 §1 的确定性校验层
from app.agent.tools import TOOLS

def run_turn(messages, provider: MaaSProvider, max_steps=6):
    for _ in range(max_steps):
        resp = provider.chat(messages, tools=TOOLS_SCHEMA)
        msg  = resp["choices"][0]["message"]
        messages.append(msg)

        if resp["choices"][0]["finish_reason"] != "tool_calls":
            return msg.get("content", "")          # 纯回复

        for call in msg["tool_calls"]:
            name = call["function"]["name"]
            try:
                args = json.loads(call["function"]["arguments"])
            except json.JSONDecodeError:
                # ⚠️ 官方明确警告：模型不总是生成有效 JSON
                messages.append(_tool_err(call, "invalid_json")); continue

            err = validate_args(name, args)         # ← 必须校验，模型会虚构参数
            if err:
                messages.append(_tool_err(call, err)); continue

            result = TOOLS[name](**args)           # 执行（副作用经确定性层）
            messages.append({
                "role": "tool",
                "tool_call_id": call["id"],
                "content": json.dumps(result, ensure_ascii=False),
            })
    return "抱歉，我没能处理过来，您可以再说一次吗？"   # 兜底，不静默失败
```

### 6.1 双 Provider 抽象（为可替换性）

```python
# app/providers/base.py
from typing import Protocol

class AgentProvider(Protocol):
    def chat(self, messages: list, tools: list | None = None) -> dict: ...

# 实现：
#   MaaSProvider         ← 一期主用（华为云，赛题体现）
#   DashScopeProvider    ← 备用（百炼 Qwen3）
#   MockProvider         ← 开发/演示（09 §五 的 mock 规矩）
```

> 与 `09`（数据源）、`11`（`PushChannel`）、`12`（`RealtimeVoiceProvider`）**同一套端口—适配器思路**。
> 好处：MaaS 挂了/涨价了/区域不可用了，换 Provider 即可，业务代码不动。

---

## 七、计费与成本

### 7.1 三种购买方式（官方）

| 计费模式 | 说明 | 适用 |
|---|---|---|
| **按需计费** | 按 Token 用量，**用多少付多少** | ⭐ 我们主用 |
| **DeepSeek Tokens 套餐包** | 预购 Token 包 | 用量可预测时划算 |
| **Token Plan 个人版套餐** | **专为开发者设计的订阅服务**，用于 CodeArts / OfficeAce / Claude Code / OpenClaw 等 AI 工具 | ⚠️ 需**指定 Base URL**，不通用 |

### 7.2 关键计费规则

| 规则 | 原文 / 说明 |
|---|---|
| 按 Token | "调用文本生成模型时，**内容生成成功会计费，内容生成失败不计费**" |
| 不用不花钱 | "**不使用服务则不会产生费用**" |
| **缓存折扣** | "命中缓存的输入**享有折扣优惠**"（§5.5） |
| 套餐抵扣顺序 | 失效时间最早 > 生效时间最早 > 创建时间最早 |
| 超出套餐 | "超出部分将自动根据使用模型的 Token 量按正常价格收费" |

### 7.3 ⚠️ 成本风险与对策

| 风险 | 对策 |
|---|---|
| 忘关服务导致持续调用 | 按需计费无固定成本；但要**管好 API Key**（"暂不支持关闭预置服务"） |
| 实时对话 token 消耗大 | `thinking.type=disabled` + 控制上下文长度 + **利用缓存前缀** |
| 记忆整理批量任务烧钱 | 用便宜模型（`deepseek-v4-flash` / `openpangu-2.0-flash`）+ 限流 |
| 代金券覆盖不了 | 先确认（T-21）；MaaS 是华为云产品，**理论上代金券可用** |

> ✅ **好消息**：MaaS 是**华为云自家产品**，ICT 大赛发放的**华为云代金券应该可以覆盖**
> （而 `12` 里的 Qwen/豆包是阿里云/火山引擎，**必须自付**）。
> → **这进一步支持"Agent 推理用 MaaS、语音用 Qwen"的双模型分工**：
> 把能省的部分放在能报销的地方。

---

## 八、约束与坑（汇总）

| # | 坑 | 应对 |
|:--:|---|---|
| 1 | **仅"西南-贵阳一"区域** | 与 `10` 的 `cn-north-4` 部署区不一致 → 跨区调用延迟需实测（T-28）；或把应用也部署到贵阳一 |
| 2 | **必须先配 ModelArts 委托授权** | 不配用不了；开通时第一件事 |
| 3 | **自动开通所有版本、不支持关闭** | 接受；靠管理 API Key 控制 |
| 4 | **`tool_choice` 支持度因模型而异** | openPangu 只有 none/auto；需要指定函数时换 DeepSeek/GLM |
| 5 | **GLM-5.3 无法关深度思考** | 实时场景**不要选 GLM-5.3** |
| 6 | **模型可能返回无效 JSON / 虚构参数** | 官方明确警告 → 必须走 `04` §1 的确定性校验层 |
| 7 | **缓存命中率不确定** | 只作成本优化，不作延迟承诺 |
| 8 | Token Plan 需专用 Base URL | 不要和按需计费的 endpoint 混用 |
| 9 | API Key 泄露 = 持续扣费 | 见 `references/credential-security.md`；**绝不进客户端/仓库** |

---

## 九、与赛题一的关系（**这是选它的最大理由之一**）

| 赛题一强制项（`05` §一） | MaaS 的贡献 |
|---|---|
| M1 用 CodeArts 开发 | — （CodeArts 是另一件事） |
| M2 基于智能体和 Skills | — |
| **M3 关联 RDS、Redis 等华为云服务** | ✅ **MaaS 本身就是华为云服务**，且是有技术含量的那个 |
| M4 部署在华为云、在线可运行 | ✅ MaaS 是无状态的推理 API，与应用部署解耦 |
| M5 入围需开源 | ⚠️ **API Key 绝不能进开源仓库** |

**申报书里可以这样写：**

> "系统的大模型推理层采用**华为云 MaaS（模型即服务）**，
> 基于 **openPangu-2.0** 系列模型实现 Agent 的工具调用与多轮推理；
> 通过 `thinking.type` 参数在实时对话场景关闭深度思考以降低首 Token 时延，
> 并利用 MaaS 的**上下文缓存**机制（官方说明适用于多轮对话与工具调用场景）
> 优化长 system prompt 与工具定义带来的重复输入开销。"

—— 这是一个**具体、可验证、有技术细节**的华为云使用说明，比"我们用了华为云"强得多。

---

## 十、决策与待验证

### 10.1 决策（D-21）

| 选项 | 评估 |
|---|---|
| ① **华为云 MaaS（openPangu）** | ✅ **推荐**。赛题契合 + 工具调用 + 可关思考 + 华为云代金券可用 |
| ② 阿里云百炼（Qwen3） | ❌ MaaS 已覆盖同类能力，且需自付（代金券不覆盖） |
| ③ CodeArts 内置模型 | ⚠️ 可用于**编码**，但作为**运行时推理**不够灵活（无 tool_choice/thinking 控制） |

> **D-21 建议采纳 ①：华为云 MaaS，实时对话用 `openpangu-2.0-flash`（关思考），
> 复杂推理用 `openpangu-2.0-pro` 或 `deepseek-v4.1-flash`。**

### 10.2 待验证

| ID | 待验证 | 期限 |
|:--:|---|---|
| **T-26** | MaaS 开通（含 ModelArts 委托授权）+ 工具调用跑通 | 2026-11-01 |
| **T-27** | MaaS 是否可用大赛发放的**华为云代金券** | 2026-10-25 |
| **T-28** | 跨区域调用延迟（应用在 `cn-north-4` vs MaaS 在贵阳一） | 2026-11-15 |
| **T-29** | `thinking.type=disabled` vs `enabled` 的首 Token 延迟实测 | 2026-11-15 |
| **T-30** | 缓存命中率与折扣幅度实测（监控 `cached_tokens`） | 2026-11-15 |

---

## 十一、参考来源

| # | 内容 | 来源 |
|:--:|---|---|
| 1 | **MaaS 标准 API V2**（完整请求/响应/模型清单/工具调用示例） | <https://support.huaweicloud.com/model-call-maas/model-call-019.html> |
| 2 | MaaS 产品介绍（定位、优势、兼容 CodeArts） | <https://support.huaweicloud.com/productdesc-maas/productdesc_maas_0002.html> |
| 3 | MaaS 功能介绍（API 调用、Python 示例） | <https://support.huaweicloud.com/productdesc-maas/productdesc_maas_0005.html> |
| 4 | 使用预置服务（**四条约束限制**） | <https://support.huaweicloud.com/model-call-maas/model-call-052.html> |
| 5 | 开通预置服务 | <https://support.huaweicloud.com/usermanual-maas/usermanual_maas_0010.html> |
| 6 | 配置 ModelArts 委托授权以使用 MaaS | <https://support.huaweicloud.com/usermanual-maas-modelarts/maas-modelarts-0016.html> |
| 7 | 文本生成模型计费（按 Token / Token Plan、缓存说明） | <https://support.huaweicloud.com/price-maas/price-maas-0002.html> |
| 8 | MaaS 计费项概述（三种购买方式） | <https://support.huaweicloud.com/price-maas/price-maas-0038.html> |
| 9 | MaaS Token Plan 计费 | <https://support.huaweicloud.com/price-maas/price-maas-0035.html> |
| 10 | 在模型广场查看预置模型 | <https://support.huaweicloud.com/usermanual-maas/usermanual_maas_0008.html> |

> ⚠️ **来源 1 是 API 参考，来源 4 是约束限制，来源 7/8 是计费**——
> 这三处**变动频繁，开通前必须回官网复核**。
