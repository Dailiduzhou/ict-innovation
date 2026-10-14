# 09 · 数据源抽象与 Mock 策略

> **决策依据（2026-10-14）**：项目书论述中，**智能穿戴与智慧家居作为数据来源列出**，**星闪写为后期扩展**；
> demo 中对智能穿戴/智慧家居做**高阶抽象**保持可扩展性，**答辩时用 mock**。
>
> 本文件的任务是：让这个决策**在技术上成立、在答辩上安全、在材料上不构成虚假陈述**。
>
> ⚠️ 先说清楚风险，再给设计。

---

## 一、必须先知道的风险：ICT 赛红线 R5

> `00-赛事适配与硬约束.md` 红线 R5 原文：
> **"提交的代码文件等相关材料经复核无法复现答辩 PPT 展示效果的队伍取消晋级或获奖资格。"**

这条规则与"答辩用 mock"**直接冲突**，如果处理不当：

| 做法 | 判定 |
|---|---|
| PPT 展示"老人心率异常 → 自动通知子女"，复现时发现该数据是写死的 JSON，且**没有任何标注** | 🔴 **可被判取消资格** |
| PPT 展示同样的流程，但**明确标注**"当前由模拟数据源驱动，真实体检数据的接入受 XX 客观限制，接口已抽象完成" | ✅ 安全 |

**结论：Mock 本身没有问题，隐藏 Mock 才是问题。**

### 三条强制规范（写进团队纪律）

1. **UI 必须自证**：任何来自 mock 的数据，界面上必须有可见标记（见 §五）
2. **PPT 必须自证**：演示页必须有一行小字说明"本页由模拟数据源驱动"
3. **代码必须自证**：mock 实现类名统一带 `Mock` 前缀，且 `capabilities()` 返回 `isDemo: true`

---

## 二、设计目标：把"不可得"变成"可替换"

`06-外部依赖核查报告.md` 已核实：

| 数据源 | 核查结论 |
|---|---|
| 智能穿戴（心率/血压/HRV） | ⚠️ 受限：数据来自运动健康 App 数据集，**小时级**时延；高阶数据不对个人开发者开放 |
| 智慧家居（灯/人体传感器/门锁） | ❌ 不可得：HarmonyOS Connect 面向硬件厂商，无第三方 API |
| 星闪 NearLink | ⚠️ 受限：仅 HarmonyOS，只提供通信能力；手机支持依赖硬件型号 |

**如果把这些写死进业务代码，项目就死了。正确做法是"端口—适配器"（六边形）架构：**

> **业务代码只依赖接口（端口），永远不依赖具体数据源。**
> 数据源是否可用、可用到什么程度，由运行时的**能力声明**决定。

这样：
- ✅ 一期用 mock 跑通全链路 → 演示没问题
- ✅ 二期接 Health Kit → 只换一个适配器，业务代码不动
- ✅ 三期接星闪终端 → 再加一个 `TransportChannel` 实现
- ✅ 数据源不可用时，UI 自动降级而不是显示假数据

---

## 三、抽象层设计

### 3.1 端口定义

```typescript
// ---------- 通用：能力声明 ----------
interface SourceCapabilities {
  metrics: Metric[];          // 能提供哪些指标
  latency: LatencyClass;      // 'realtime' | 'minute' | 'hour' | 'day'
  evidenceLevel: EvidenceLevel; // E0..E4，见 04 §8.2
  requiresDevice: boolean;    // 是否需要外部硬件
  requiresPairing: boolean;   // 是否需要配对/授权
  isDemo: boolean;            // ★ 是否为演示数据
  available: boolean;         // 当前是否可用
  unavailableReason?: string; // 不可用原因（用于 UI 文案）
}

// ---------- 端口 1：生理数据 ----------
interface VitalSource {
  capabilities(): Promise<SourceCapabilities>;
  getLatest(elderId: string, metric: Metric): Promise<Reading | null>;
  getSeries(elderId: string, metric: Metric, range: TimeRange): Promise<Reading[]>;
  subscribe(elderId: string, metrics: Metric[], cb: (r: Reading) => void): Subscription;
}

// ---------- 端口 2：环境/家居数据 ----------
interface EnvironmentSource {
  capabilities(): Promise<SourceCapabilities>;
  getRoomState(elderId: string): Promise<RoomState[]>;   // 灯 / 人体传感器 / 门锁
  subscribe(elderId: string, cb: (s: RoomState[]) => void): Subscription;
}

// ---------- 端口 3：传输通道（星闪的位置在这里） ----------
interface TransportChannel {
  capabilities(): Promise<SourceCapabilities>;
  send(deviceId: string, payload: Uint8Array): Promise<void>;
  onReceive(deviceId: string, cb: (payload: Uint8Array) => void): Subscription;
}

// ---------- 通用数据单元 ----------
interface Reading {
  metric: Metric;
  value: number | string;
  unit: string;
  measuredAt: Date;
  evidenceLevel: EvidenceLevel;  // ★ 每条数据自带证据等级
  sourceKind: 'mock' | 'manual' | 'relative_report' | 'device';
  deviceLabel?: string;
}
```

**设计要点**：`evidenceLevel` 与 `sourceKind` 是**数据自带的元数据**，不是 UI 层补的。
这样 `07-评测与验证方案.md` 的 **E-07（证据等级标注正确率）** 才有测量对象。

### 3.2 适配器实现矩阵

| 适配器 | 端口 | 阶段 | 提供的数据 | 证据等级 | isDemo |
|---|---|:--:|---|:--:|:--:|
| `MockVitalSource` | VitalSource | **一期（答辩用）** | 心率/血压/HRV/血氧/睡眠 | **E3'**（演示） | ✅ |
| `MockEnvironmentSource` | EnvironmentSource | **一期（答辩用）** | 灯/人体传感器/门锁状态 | **E3'**（演示） | ✅ |
| `ManualVitalSource` | VitalSource | 一期（真实可用） | 老人自述/手动录入的指标 | **E1** | ❌ |
| `RelativeReportSource` | VitalSource | 一期（真实可用） | 亲属反馈的健康情况 | **E2** | ❌ |
| `DialogInferredSource` | VitalSource | 一期（真实可用） | 从 AI 闲聊中提取的健康线索 | **E1** | ❌ |
| `HuaweiHealthSource` | VitalSource | 二期 | Health Service Kit 数据 | E3 | ❌ |
| `HuaweiSmartHomeSource` | EnvironmentSource | **无**（客观不可得） | — | — | — |
| `HttpsChannel` | TransportChannel | 一期 | 手机 ↔ 云 | — | ❌ |
| `MockChannel` | TransportChannel | 一期（答辩） | 模拟终端通道 | — | ✅ |
| `NearLinkChannel` | TransportChannel | 三期（预留） | 星闪终端 ↔ 手机 | — | ❌ |

> **`HuaweiSmartHomeSource` 保留为空的接口占位**——`capabilities()` 直接返回
> `{available: false, unavailableReason: 'HarmonyOS Connect 未提供面向第三方应用的设备状态接口'}`。
> 这比删掉接口更好：它**把"不可得"编码进了系统**，答辩时可以直接展示这个降级行为。

### 3.3 依赖注入与配置

```yaml
# config/sources.yaml —— 通过配置切换，不改代码
vital:
  - mock                    # 演示模式启用
  - manual
  - dialog_inferred
  - huawei_health           # 关闭：个人开发者无高阶数据权限
environment:
  - mock                    # 演示模式启用
  # - huawei_smarthome      # 关闭：客观不可得
  - disabled_placeholder
transport:
  - https
  - mock
  # - nearlink              # 三期
demo_mode: true             # ★ 全局开关，打开后 UI 显示演示徽标
```

---

## 四、UI 降级行为（抽象层的价值兑现）

**规则：UI 根据 `capabilities()` 渲染，而不是假设数据一定存在。**

| 数据源状态 | UI 表现 |
|---|---|
| `available: true, isDemo: false` | 正常显示指标 + 采集时间 + 证据等级标签 |
| `available: true, isDemo: true` | 正常显示，但**右上角有「演示数据」徽标**；证据标签显示为「模拟」 |
| `available: false` | **不显示该指标卡片**，或显示为灰色占位并给出 `unavailableReason` 文案 |
| `latency: 'hour'` | 显示「更新于 X 小时前」，**不显示"实时"字样** |
| 需要配对但未配对 | 显示引导（"接入华为穿戴可查看心率"→ 二期功能，标注"即将支持"） |

**绝对禁止的 UI 行为：**

- ❌ 数据源不可用时，用假数据填充
- ❌ 把 `latency: 'hour'` 渲染成"实时"
- ❌ 把 E1（老人自报）渲染成"已确认 ✓"
- ❌ mock 数据不加任何标记

---

## 五、Mock 的具体规矩

| 项 | 规定 |
|---|---|
| **类名** | 必须以 `Mock` 开头 |
| **数据来源** | 从 `fixtures/demo/` 下的 JSON 读取，**不得内联**在业务代码里 |
| **数据内容** | 必须**明显是演示数据**（如数值在合理但不精确的范围；不要伪造具体人名/医院/病历） |
| **UI 标记** | 全局 `demo_mode=true` 时，**所有页面顶部显示「演示模式 · 数据为模拟」横幅** |
| **证据等级** | mock 数据的 `evidenceLevel` 显示为「模拟（非真实采集）」 |
| **PPT 标注** | 演示页脚注：**"本页数据由模拟数据源驱动。真实设备接入受客观条件限制，详见技术方案 §数据源架构"** |
| **演示脚本** | 答辩时必须**主动说明**这是 mock，并展示 `config/sources.yaml` 与适配器列表——**主动说明比被问出来好一百倍** |

### 5.1 答辩演示脚本（建议）

```
【演示前 30 秒】
"先说清楚数据来源：我们的数据源是分层抽象的。老人自述、亲属反馈、AI 闲聊提取
 是一期真实可用的；智能穿戴和智慧家居我们完成了完整抽象和模拟实现，
 因为华为健康数据对个人开发者的开放等级限制，以及 HarmonyOS Connect
 不提供面向第三方应用的设备状态接口——这一点我们在技术方案里如实写了。
 现在演示用的是模拟数据源。"

【演示中】
（界面顶部可见「演示模式」横幅）

【被问到"能不能真接"时】
"能。VitalSource 是个端口，接 Health Service Kit 只需要新增一个适配器，
 业务代码一行不改。这是我们的 sources.yaml，现在 mock 这一行改成
 huawei_health，其余不动。"
```

---

## 六、项目书论述规范 ⚠️ 关键

**这是本文件最重要的部分。** 项目书写"智能穿戴和智慧家居作为数据来源"是完全可行的，
但**必须用分层的写法**，否则答辩时会被追着打到死角。

### 6.1 推荐的写法（分层陈述 + 能力声明）

> **3.x 数据来源架构**
>
> AgeGuard 的数据来源采用**分层抽象设计**，通过统一的 `Source` 端口隔离业务逻辑与具体数据源，
> 使系统能够在不修改核心业务代码的前提下接入新的数据源。数据来源按**一期实现 / 二期扩展 / 客观受限**三层组织：
>
> **（1）一期实现层 —— 已具备真实数据通路**
> - **老人自述与问卷**：老人通过自然语言或表单主动录入的身体感受、用药情况
> - **亲属反馈**：家庭成员在事项流程中反馈的老人实际状况
> - **AI 对话线索提取**：从日常闲聊中提取的健康与情绪线索（经老人授权）
> - **手动指标录入**：老人或亲属手动录入的血压、血糖等测量值
>
> **（2）二期扩展层 —— 接口已抽象，待授权资质**
> - **智能穿戴设备数据**（心率、静息心率、心率变异性、血氧、睡眠分期）：
>   系统已实现 `VitalSource` 端口的适配器接口定义与能力声明机制。
>   实际接入依赖华为 Health Service Kit，其**数据及时性为小时级**，
>   且**部分高阶数据权限暂不对个人开发者开放**，需企业开发者资质。
>   因此一期采用**模拟数据源**完成链路验证与演示，二期在取得相应资质后接入。
> - **智慧家居环境数据**（照明时段、人体活动、门锁状态）：
>   系统已定义 `EnvironmentSource` 端口及能力声明。
>   经评估，华为 HarmonyOS Connect（鸿蒙智联）面向**智能硬件设备商与模组伙伴**开放，
>   需签署合作协议并通过产品认证，**当前不存在面向第三方应用的家居设备状态查询接口**。
>   因此该数据源在架构中保留为**接口占位**，运行时返回"不可用"状态，
>   系统据此自动降级，不向前端透出该维度信息。
>
> **（3）预留扩展层 —— 连接方式抽象**
> - 系统已定义 `TransportChannel` 端口，当前实现为 HTTPS。
>   **星闪（NearLink）作为低功耗、低时延的短距连接方案，
>   是未来实体语音终端与手机之间通信的可选扩展路径**。
>   需说明的是，NearLink Kit 目前仅面向 HarmonyOS 应用开放，
>   且手机端支持程度取决于具体硬件型号，
>   因此本项目将其列为**远期扩展**，不纳入一期交付范围。
>
> **（4）数据可信度机制**
> 由于不同数据源在**采集方式、时效性与可信程度**上存在显著差异，
> 系统为**每一条数据记录**附加**证据等级标签**（E1 用户自述 / E2 亲属确认 / E3 设备记录），
> 在全部展示场景中如实呈现来源与采集时间，**不对低可信度数据做确认性表述**。

### 6.2 禁止的写法

| ❌ 禁止 | 原因 |
|---|---|
| "系统通过智能穿戴设备实时采集老人的心率、血压数据" | **"实时"是假的**（小时级）；"通过穿戴设备采集"暗示直连传感器，实际是 Health App 数据集 |
| "通过智能家居传感器感知老人居家行为" | 第三方 App 拿不到 |
| "已支持星闪连接" | 没做 |
| "二期将接入微信" | 无公开接口（`06` §6） |
| 把 mock 数据截图当作真实系统数据放进材料 | 踩 R5 |
| 把 `HuaweiSmartHomeSource` 从架构图里删掉 | 丢掉了"我们评估过并如实说明了限制"这个加分点 |

### 6.3 一句话记忆

> **写"我们设计了接口、说明了它的限制、并给出了替代路径" —— 这是工程判断力。**
> **写"我们用了这个数据源" —— 这是虚假陈述。**

---

## 七、与证据分级模型的衔接

`04-AI-Agent设计.md` §8.2 定义了 E0–E4。本文件的数据源抽象必须**一一对应**：

| 数据源适配器 | 产出证据等级 | 亲属端如何展示 |
|---|:--:|---|
| `MockVitalSource` | **模拟** | 灰度 + "演示数据"徽标 |
| `DialogInferredSource` | E1 | "老人提到" |
| `ManualVitalSource` | E1 | "老人自报（MM-DD HH:mm 录入）" |
| `RelativeReportSource` | E2 | "家属确认" |
| `HuaweiHealthSource`（二期） | E3 | "设备记录（更新于 X 小时前）" |

**这张表要放进答辩 PPT**——它同时证明了：技术深度（抽象层）、合规意识（证据分级）、诚实度（标注限制）。

---

## 八、本文件的待确认项

- [ ] `demo_mode` 是否需要在**生产构建**中物理移除 mock 代码？（建议：保留类但构建时排除 fixture，便于二期回归测试）
- [ ] mock fixture 的数值范围由谁定义？（建议：用公开的老年人群生理指标区间，不编造具体病例）
- [ ] 星闪的预留接口做到什么深度？（建议：只做接口 + 文档，不做实现，避免过度设计）
- [ ] 是否需要把 `HuaweiSmartHomeSource` 的占位实现写成可运行的降级演示？（建议：要，答辩价值高）
