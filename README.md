# TaskOps_AutoFill_Guard

> 一个"先分析、后规划、经授权才执行"的任务 Agent 行为规范：多源文档与链接深度提取 → 任务结构化拆解 → 方案与默认值推荐 → 已知信息池自动补全 → 暂存填报，全程带**硬性安全红线**。

**它解决什么问题**：让 AI 帮你把一堆散落的文档、链接、聊天记录变成一张可执行的任务清单并代你填表，同时**永远不替你按下"提交/支付"**——因为这一步的风险不该由 AI 承担。

由 [@mixiandawang](https://github.com/mixiandawang) 维护 · MIT License

---

## 目录

- [三种用法](#三种用法)
- [核心能力](#核心能力)
- [硬性安全红线](#硬性安全红线)
- [文件结构](#文件结构)
- [自检](#自检)
- [隐私与安全](#隐私与安全)
- [限制](#限制)
- [发布你自己的版本](#发布你自己的版本)
- [License](#license)

---

## 三种用法

### 用法 1：当提示词模板用（任何模型，零安装，**推荐先试**）

打开 [`prompt-template.md`](prompt-template.md)，把横线以内的全文复制，连同你的材料一起发给任意大模型即可。适用于 ChatGPT、Claude、DeepSeek、Gemini、本地模型等**任何**对话环境。

### 用法 2：装成 Agent Skill（支持 Agent Skills 约定的 harness）

`SKILL.md` 采用通用的 Agent Skills 约定（`SKILL.md` + YAML frontmatter），把它放到对应 harness 的技能目录即可自动发现：

| harness | 安装位置 |
|---|---|
| DSH | 项目级 `.dsh/skills/` 或 `.agents/skills/`；用户级 `~/.dsh/skills/` |
| Claude Code | 项目级 `.claude/skills/`；用户级 `~/.claude/skills/` |
| 其他兼容 harness | 参考其文档，本质是"技能根目录下的一级子目录里放 `SKILL.md`" |

**安装方式**：把 `skills/taskops-guard-skill/` 这个**整个子目录**复制过去。

```bash
# DSH 用户级（对所有工作区生效）
cp -r skills/taskops-guard-skill ~/.dsh/skills/

# Claude Code 用户级
cp -r skills/taskops-guard-skill ~/.claude/skills/
```

Windows PowerShell：

```powershell
Copy-Item -Recurse skills\taskops-guard-skill $env:USERPROFILE\.dsh\skills\
```

**安装后自检**：新开一个会话，确认技能出现在可用技能列表里。
若没出现，99% 是下面两个原因之一 —— 见[自检](#自检)。

### 用法 3：直接读规范

[`skills/taskops-guard-skill/SKILL.md`](skills/taskops-guard-skill/SKILL.md) 本身就是一份可读的行为规范，可以照着改写成你自己的版本。

---

## 核心能力

| # | 能力 | 说明 |
|---|---|---|
| ① | **自动分析，不漏隐藏任务** | 同时提取显性要求与隐性已知信息；文档里的 URL **强制穿透读取**，防止需求藏在链接深处 |
| ② | **结构化任务清单** | 输出 `编号/任务名称/要求/缺失/状态` 大表，五种状态可视化：`待确认`/`已明确`/`可执行`/`已完成`/`已卡堵` |
| ③ | **智能方案与建议** | 每个任务附【操作流程步骤】+【推荐工具】；参数缺失时给默认值补位（作文 800 字、A4 小四 1.5 倍行距等），并如实标注是默认值 |
| ④ | **动态决策与增量接收** | 自动区分"补充已有任务信息"与"变更/追加新任务"，前者走轻量增量输出，后者并入任务表重排 |
| ⑤ | **已知信息池自动补全** | 按 `用户对话 > 文档/链接 > 默认值` 优先级维护信息池，填报时自动补全并标注来源，减少重复输入 |
| ⑥ | **安全防护与底层保障** | 暂存不提交 + 单次尝试熔断 + OCR 强制标注，见下节 |

### 工作模式

```
[接收输入 (文档 / 链接 / 对话)]
        │
   ┌────┴─────┐
   ▼          ▼
[异常/阻碍]  [正常解析与规划]
   │          │
   │          ├──► (未收到"开始任务/开始填报") ──► Mode 2: ANALYSIS_MODE
   ▼          │
Mode 1: FUSE  └──► (收到"开始任务"或"开始填报") ──► Mode 3: EXECUTION_MODE
```

判定优先级：**Mode 1 > Mode 3 > Mode 2**。

---

## 硬性安全红线

这三条是本项目存在的理由，也是它区别于普通"帮我填表"提示词的地方：

1. **暂存不提交** — 支持"暂存/保存草稿"的只暂存；不支持的只保持填写状态。**永不点击【提交/发送/支付/确认订单/报名提交】** 等任何使内容生效的按钮。执行结果一律以"请您核对无误后自行点击提交"收尾。
2. **单次尝试熔断** — 网页访问与工具调用**各限 1 次**。遇登录凭证缺失、验证码、付费墙、网络错误、超时，**立即止阻**并输出卡阻报告，不重试、不绕行、不猜测。
3. **质量把控** — 扫描件/截图/手写体必须走 OCR，并**强制标注 `（OCR 识别，可能有误）`**；模糊或冲突的内容严禁编造，一律列入缺失。

> ⚠️ **免责声明**：本规范是**行为约束**，不是技术隔离。它的安全性最终取决于宿主 harness 的权限边界与你自己的核对。任何自动填报结果都请人工复核后再提交。

---

## 文件结构

```
taskops-guard-skill/
├── README.md                          # 本文件
├── SKILL.md                           # 技能主体（与 skills/ 下内容一致）
├── prompt-template.md                 # 无 frontmatter 的提示词模板（供任意模型粘贴）
├── LICENSE                            # MIT
├── .gitignore
├── .gitattributes                     # 统一 LF 换行，防止 Windows 下 diff 全文件飘红
├── scripts/
│   └── validate.mjs                   # 自检：frontmatter 合法性 + 防止两份 SKILL.md 漂移
└── skills/
    └── taskops-guard-skill/
        └── SKILL.md                   # 可安装的 Skill 包（Agent Skills 约定）
```

**为什么有两份 `SKILL.md`**：根目录那份方便直接阅读，`skills/` 下那份符合 Agent Skills 的目录约定（技能根目录 → 一级子目录 → `SKILL.md`）。两者内容必须一致，`scripts/validate.mjs` 会检查漂移。

---

## 自检

```bash
node scripts/validate.mjs
```

检查项：

1. `skills/taskops-guard-skill/SKILL.md` 存在且含合法 YAML frontmatter
2. `name` 符合正则 `^[a-z0-9]+(?:-[a-z0-9]+)*$`（**小写 kebab-case，这是硬性校验**）
3. 必填字段 `name` / `description` 非空
4. 未使用已废弃的 frontmatter 键（如 `modelInvocable`，会直接报错并导致技能被丢弃）
5. 两份 `SKILL.md` 正文一致（无漂移）

### 技能装了但没被发现的常见原因

| 现象 | 原因 | 修法 |
|---|---|---|
| 完全不出现，无任何报错 | `name` 里有大写字母或下划线 | 改成 `taskops-guard-skill` 这种小写 kebab-case |
| 完全不出现 | `SKILL.md` 位置放错 | 必须在技能根目录的**一级子目录**内，不能是根目录的 `SKILL.md` |
| 完全不出现 | 文件名不是 `SKILL.md` | 改成全大写 `SKILL.md` |
| 报了 frontmatter 错误 | 用了 `modelInvocable` 等旧键 | 改用 `disable-model-invocation` / `user-invocable` |

---

## 隐私与安全

本技能允许在用户**明确要求持久化**时，把【已知信息池】写入工作区的 `taskops-known-info.md`。该文件会包含姓名、学号、联系方式等个人信息：

- `.gitignore` **已默认忽略** `taskops-known-info.md` 与 `*.known-info.md`
- 如果你复制这个仓库另作他用，**请勿**在提交前删除该忽略规则
- 把个人信息交给任何 LLM 之前，请自行评估对方的数据政策

---

## 限制

- **不绑定具体工具名**：技能通过"能力映射表"引用宿主能力（网页抓取 / 联网搜索 / OCR / 文件读写），宿主缺少某项能力时按 Mode 1 熔断，而不是猜测。因此它能在不同 harness 上运行，但**功能上限取决于宿主**。
- **无浏览器会话**：抓取工具通常不带登录态、不执行 JS，所以需要登录或前端渲染的页面必然触发熔断——这是设计预期，不是缺陷。
- **不做法律与合规判断**：代填第三方系统前，请先确认目标站点的服务条款允许自动化操作。
- **不安装任何软件、不启动任何服务、不代用户登录**。

---

## 发布你自己的版本

> 本章节面向 **fork 本仓库后二次发布**的使用者。只想使用本技能的话，直接看[三种用法](#三种用法)即可，无需阅读本章。

### 第一步：发布前的两道检查

```bash
# 1. 确认没有把个人信息/材料混进仓库（.gitignore 已挡 taskops-known-info.md）
git status --short

# 2. 自检技能包：frontmatter 合法性 + 两份 SKILL.md 防漂移
node scripts/validate.mjs
```

第 2 条拦的是**静默失败**：技能名带大写、`SKILL.md` 放错层级这类问题，harness 不会报错，只会当作技能不存在——别人装了没反应，还查不出原因。

### 第二步：首次上传（仅在第一次需要，做完就不用再敲）

```bash
git init
git add .
git commit -m "feat: 我的任务分析规划与安全填报技能"
git branch -M main
git remote add origin <你的仓库地址>
git push -u origin main
```

执行前请在 GitHub 网页端新建一个**空仓库**（不要勾 Add README / .gitignore / License，避免与本地冲突）。

> ⚠️ **`git init` 与 `git remote add origin` 只需执行一次。** 重复运行会提示 `remote origin already exists`。若要同时推送 Gitee 镜像，请给第二个远端换个名字（例如 `gitee`），不要再用 `origin`。

### 第三步：日常更新只需三条

```bash
git add .
git commit -m "改了什么"
git push
```

首次推送时加了 `-u`，追踪关系已建立，之后不必再写 `origin main`。

### Windows 用户建议的两项全局配置

```bash
# 提交身份（必填，否则无法 commit）
# 注意：user.email 会公开出现在每个 commit 上。
# 想隐藏真实邮箱，请用 GitHub 提供的匿名地址（Settings → Emails 可查到）：
#   <你的数字ID>+<你的用户名>@users.noreply.github.com
git config --global user.name  "你的名字"
git config --global user.email "你的邮箱或 noreply 地址"

# 中文路径不再显示成 \344\275\240 这种转义
git config --global core.quotepath false
```

`user.email` 一旦进入提交历史就很难清洗，**建议第一次 push 前就决定好**用真实邮箱还是 noreply 地址。

### ⚠️ 排查 SSL 校验

若你的全局配置里存在 `http.sslVerify=false`，**建议在推送前删掉**：

```bash
git config --global --unset http.sslVerify
```

保持 TLS 校验关闭意味着推送流量可被中间人替换，对本项目（一段会被别人当指令执行的提示词）风险尤其高。若你的网络环境确实需要它才能连通（企业代理 / 证书拦截），请改用企业根证书或代理配置，而不是永久关闭校验。

---

## License

[MIT](LICENSE) © 2025 mixiandawang
