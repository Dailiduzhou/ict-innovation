# 10 · 华为云部署与 KooCLI

> 赛题一硬性要求（`05` §一 M4）：**"完成应用在华为云上的部署，确保作品可在线运行"**。
> 本地 `npm run dev` 不算数，**初赛材料提交前必须有一个公网可访问的 URL**。
>
> 工具与技能的完整说明在 skill 里：**`.agents/skills/huaweicloud-koocli-deploy/`**

---

## 一、为什么用 KooCLI

**KooCLI**（华为云命令行工具服务，Koo Command Line Interface，原名 HCloud CLI）是为**发布在 API Explorer 上的云服务 API** 提供的命令行管理工具。

| 用 KooCLI 的理由 | 说明 |
|---|---|
| **透明可评审** | 一条条命令都在脚本里，评审看得懂；比控制台截图可信 |
| **可复现** | 换了机器/账号，跑同一个脚本能重建一套环境 |
| **可演示** | 答辩现场跑"一键部署"比讲架构图有说服力 |
| **与赛题相关** | 赛题一考的是"华为云产品"，KooCLI 本身就是华为云产品线的一员 |
| **幂等可控** | 先查后建，重复执行不重复花钱 |

**不推荐的用法**：
- ❌ 应用运行时 shell out 调 `hcloud`（用 SDK）
- ❌ 长期 IaC 状态管理（用 RFS 资源编排或 Terraform，列入二期，见 `08` D-17）

---

## 二、部署拓扑（`cn-north-4`）

```
cn-north-4
├── VPC            vpc-ageguard            10.0.0.0/16      不计费
│   ├── Subnet     subnet-ageguard-app     10.0.1.0/24      不计费
│   └── Subnet     subnet-ageguard-data    10.0.2.0/24      不计费
├── SecurityGroup  sg-ageguard-app         80/443 全网；22 仅管理 IP
├── SecurityGroup  sg-ageguard-data        3306/6379 仅来自 sg-app
├── ECS            ecs-ageguard-app        最小规格                ★计费
│   └── EIP        公网地址                ← M4 的载体           ★计费
├── RDS            rds-ageguard            MySQL 8.0 / PG 最小规格 ★计费
├── DCS (Redis)    redis-ageguard          单机最小规格           ★计费
└── OBS            obs-ageguard-audit      审计归档（可选）        ★计费
```

### 创建顺序（依赖关系，**不能乱**）

```
1. IAM 子账号 + AK/SK          ← 先建，后面全用它
2. VPC
3. Subnet (app / data)
4. SecurityGroup + 规则
5. RDS                         ← 依赖 subnet-data + sg-data
6. DCS Redis                   ← 依赖 subnet-data + sg-data
7. ECS                         ← 依赖 subnet-app + sg-app
8. EIP + 绑定 ECS
9. 部署应用（迁移 + 起服务）
10. OBS（可选）
```

**验收标准**：公网浏览器打开 `http://<EIP>/` 能看到 AgeGuard 登录页。

---

## 三、工具获取：**不预置到项目**（D-18）

> ✅ **决议（2026-10-14）D-18**：**KooCLI 由 CodeArts Agent 在部署时自行获取，不预置到项目中。**

| 做 | 不做 |
|---|------|
| ✅ `deploy/` 脚本只假设 `hcloud` 在 PATH 中 | ❌ 把 `hcloud` 二进制/安装包 commit 进仓库 |
| ✅ 在 README / 部署文档写清楚前置条件与获取命令 | ❌ 把 `huaweicloud-devkit` 写进 `package.json` / `requirements.txt` |
| ✅ 脚本开头 `command -v hcloud || die` 并提示获取方式 | ❌ 在 `.agents/` 里预置官方 skill 副本 |

**好处**：仓库干净；赛题一 M5 开源时不用清理第三方代码；工具版本不会跟仓库一起陈旧。

**Agent 运行时执行的获取命令**：

```bash
# 方式 1：一键脚本
curl -sSL https://cn-north-4-hdn-koocli.obs.cn-north-4.myhuaweicloud.com/cli/latest/hcloud_install.sh \
  -o ./hcloud_install.sh && bash ./hcloud_install.sh

# 方式 2：官方 DevKit（附带 skills + 安全护栏 + 凭证脱敏）
npx --yes huaweicloud-devkit install-hcloud && npx --yes huaweicloud-devkit auth init

hcloud --version    # 验证
```

> ℹ️ **“不预置到项目” ≠ “不能用”**。
> ✅ **D-16（2026-10-14）：选①——装到 Agent 侧。**
> 即 `npx --yes huaweicloud-devkit install --target codearts` 装在 CodeArts 插件目录，
> 不进仓库、不进依赖。装了它就有**写操作人工确认 + 凭证脱敏 + 区域可用性预检**三道护栏。

### Skill 的使用

skill 位于 `.agents/skills/huaweicloud-koocli-deploy/`（已软链到 `.claude/skills/`）：

| 文件 | 内容 |
|---|---|
| `SKILL.md` | 主入口：安装、鉴权、命令发现、部署拓扑、沙箱陷阱、排错 |
| `references/koocli-reference.md` | 完整选项表、配置项管理、已验证命令、服务可用性评估 |
| `references/credential-security.md` | AK/SK 与 IAM 最小权限、防泄露清单、事故处置 |
| `references/official-skills.md` | 官方 `huaweicloud-devkit` / `huaweicloud-skills` 生态（**仅供了解，不预置**） |
| `scripts/deploy-skeleton.sh` | 幂等部署脚本骨架 |
| `scripts/destroy-skeleton.sh` | 资源清理脚本骨架 |

**触发方式**：提到"部署到华为云""开通 RDS/Redis""KooCLI""hcloud""一键部署脚本""云资源"时自动加载。

---

## 四、客户端与推送（D-07）

> ✅ **决议（2026-10-14）D-07**：**前期主要适配 Android**，动因为**离线消息推送**。
> 完整方案见 [`11-客户端与推送方案.md`](11-客户端与推送方案.md)。

对部署的影响：

| 项 | 影响 |
|---|---|
| 应用类型 | 后端 API + **Android 客户端**（不再是纯 Web） |
| 公网 URL | 仍需提供（Web 管理端/演示入口 + API） |
| 推送服务端 | 需在华为云上运行**推送下发服务**（调 HMS Push 服务端 API） |
| 推送凭证 | AGC 推送服务密钥，同样适用 §七 的凭证三层策略 |
| 客户端构建 | 需 Android Studio + JDK（写 Kotlin 原生模块/小组件），但**业务代码全在 TS**（`11` §4.1） |

> ⚠️ **Push Kit 属 HMS Core，不是华为云产品**。赛题一要求的是华为云，
> 推送是**额外**的华为技术集成，不能替代 M4 的"应用部署在华为云"。

---

## 五、三条铁律（写进团队纪律）

| # | 铁律 |
|:--:|---|
| 1 | **AK/SK 绝不进代码/脚本/`.env`/git/聊天记录**。赛题一 M5 要求开源，一旦写进代码就会公开 |
| 2 | **所有写操作先 `--dryrun`**。打印请求报文但不真正调用 API |
| 3 | **不凭记忆写 operation 名**。一律 `hcloud <SERVICE> --help` 现场确认 |

---

## 六、⚠️ CodeArts 沙箱陷阱（赛题一最相关的坑）

赛题一**强制使用 CodeArts 代码智能体**开发，但：

> **CodeArts Agent 默认开启沙箱模式，会直接拦截 KooCLI。**
> （官方 DevKit README 原文：*"CodeArts defaults to sandbox mode which blocks KooCLI"*）

**解法**（二选一）：
1. 在**沙箱外的终端**安装 KooCLI，Agent 只调用已安装的 `hcloud`
2. 关闭沙箱：CodeArts 设置 → `Chats` → `Agents Terminal Command Running Mode` → `Auto Running`

> ⚠️ **与 D-18 直接相关**：既然不预置，Agent 就必须在运行时**能装上**。
> 所以开工第一周就要验证（`08` T-10 / R-18），别拖到部署那天。

---

## 七、凭证策略（三层）

| 用途 | 用什么 | 存哪 |
|---|---|---|
| 本地开发（人） | 子账号 AKSK | `hcloud` profile（本地，**不提交**） |
| CI / 部署脚本 | 子账号 AKSK | **环境变量**，CI secret 注入 |
| **ECS 运行态** | **`ecsAgency` 委托** | **什么都不存** ⭐ |

> ⭐ **演示期结束前把部署脚本从 AKSK 切到 `ecsAgency`**。
> 这在答辩里是一个**可演示的安全加分点**："我们的服务器上不存在任何长期密钥。"

详见 `references/credential-security.md`。

---

## 八、仓库卫生

`.gitignore` 必备：

```gitignore
.hcloud/
hcloud_install.sh
*.pem
*.key
credentials*
**/mcp_settings.json
.env
.env.*
!.env.example
deploy/out/
deploy/*.log
```

提交前自查：

```bash
git grep -nE "(cli-secret-key|secret.?key|HW_SECRET_KEY)" -- . | grep -v example
git log -p --all -S 'cli-secret-key' -- .   # 查历史（改 .gitignore 不能清历史）
```

---

## 九、成本纪律（代金券有限）

| 项 | 内容 |
|---|---|
| **来源** | ICT 大赛报名组队成功后由华为以**队伍为单位**发放代金券/成长积分 |
| **不计费** | VPC、Subnet、SecurityGroup、IAM |
| **计费** | ECS、RDS、DCS Redis、**EIP**、OBS 存储、**RDS 备份** |
| **必做** | ① 选最小规格 ② **设费用告警** ③ 每周看账单 ④ **用完跑 `destroy-skeleton.sh`** |

> ⚠️ **RDS 备份默认会保留并计费**，删除实例后要单独删备份。
> "忘记关资源"是学生团队最常见的翻车方式。

---

## 十、时间表

| 时间 | 里程碑 |
|---|---|
| 2026-10-22 | KooCLI 安装完成 + `hcloud configure` 鉴权成功（`08` T-09） |
| 2026-10-22 | 验证 CodeArts 沙箱是否拦截 KooCLI（`08` T-10） |
| 2026-10-25 | 确认代金券额度 + 最小规格计费（`08` T-11） |
| 2026-11-01 | 建好 VPC / Subnet / SG（不计费，可提前） |
| 2026-11-15 | RDS + Redis 就绪，应用能连上 |
| **2026-12-01** | **应用部署到 ECS，拿到公网 URL** ← 初赛材料硬要求 |
| 2027-01 | 切换 `ecsAgency`，移除长期密钥 |
| 2027-06 | 演示期结束，跑 `destroy-skeleton.sh` |

---

## 十一、待核实（同步到 `ideas/08` T 清单）

- [ ] `hcloud --help` 的实际服务代号（VPC / RDS / DCS / EIP）
- [ ] RDS / DCS 创建实例的 operation 名与必填参数（用 `--skeleton`）
- [ ] **OBS 能否用 KooCLI 管理**，还是必须用 `obsutil`
- [ ] ECS 创建的镜像 ID / 规格 ID（随区域变化）
- [ ] 代金券额度是否覆盖 RDS + DCS + ECS + EIP
- [ ] DevStation 沙箱的公网 URL 是否可用作初赛材料的"在线地址"
