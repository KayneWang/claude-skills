# gitlab-issue-dev

领取分配给你的 GitLab issue，端到端开发到 Draft MR —— 列出 issue → 确认实现方案 → 开分支 → 开发自测 → push → 创建关联 issue 的 Draft MR。

> 本文档讲**怎么配置和使用**。`SKILL.md` 是给 agent 看的执行指令，无需手动阅读。

## 能力概览

- **领取 issue**：拉取当前项目里分配给你的 open issues，选一个开始；自动带上 issue 全文、讨论区评论（常有补充需求）和关联 MR（避免撞车）。
- **两道确认门**：动手写代码前先给你过目实现方案；push 和建 MR 前再确认一次改动摘要 —— 中间过程自动，关键节点你说了算。
- **规范分支名**：从最新默认分支切出 `feature/<iid>-<slug>` 或 `fix/<iid>-<slug>`（bug 类 label 自动识别；中文标题会翻成英文 slug）。
- **Draft MR 闭环**：MR 自动加 `Draft:` 前缀、目标为项目默认分支、描述末尾带 `Closes #<iid>` —— 合并时自动关闭 issue；你 review 后手动 mark ready。

## 前置配置

### 1. GitLab Personal Access Token（必需）

在 GitLab 生成：`Preferences → Access Tokens` → 勾选 **`api`** scope → Create → **立刻复制保存**。

把 token 设到环境变量 `GITLAB_TOKEN`，最可靠的方式是写进 shell 配置文件：

```bash
echo 'export GITLAB_TOKEN=<你的token>' >> ~/.zshrc   # 或 ~/.bashrc
# 重开终端，或 source 一下
```

> ⚠️ 不要把 token 写进任何会提交到 git 的文件。

### 2. GitLab 项目仓库（必需）

在**目标项目**目录里使用 —— 该仓库的 `origin` remote 需指向 GitLab 项目（自建 GitLab 也行，host 从 remote 地址自动解析）。remote 解析不了或不标准时，可用环境变量覆盖：

```bash
export GITLAB_HOST=gitlab.mycorp.com
export GITLAB_PROJECT=team/app
```

known 的非 GitLab host（github.com 等）会被直接拒绝，防止 token 发错地方。

### 3. 干净的工作区

开始前请提交或 stash 未完成的改动 —— 工作区不干净时 agent 会先停下来问你怎么处理，不会悄悄丢弃任何东西。

## 怎么用

在你的 **GitLab 项目**目录里开一个 Claude Code 会话，直接用自然语言触发：

```
开发一个分配给我的 issue
```

agent 会：列出分配给你的 open issues → 你选一个 → 整理实现方案给你确认 → 从最新默认分支开分支 → 开发并跑测试/lint → 给你看改动摘要确认 → push 并创建 Draft MR → 报告 MR 链接。

## 底层脚本（一般无需手动调）

skill 内部会调这个 CLI，你也可以单独跑来调试（在目标 GitLab 仓库里运行，`<skill-dir>` 即本目录）：

```bash
node <skill-dir>/gitlab.js issues            # 分配给你的 open issues（JSON）
node <skill-dir>/gitlab.js issue <iid>       # 单个 issue 全文：描述、评论、关联 MR
node <skill-dir>/gitlab.js mr <branch> --issue <iid> --title <t> --description <d>   # 创建 Draft MR
```

Node 18+，零 npm 依赖。测试：`npm test`。

## 范围与边界

- **做**：一个 issue → 一个分支 → 一个 Draft MR 的完整闭环。
- **不做**：改 issue 状态 / label / assignee（`Closes #` 会在 MR 合并时自动关 issue）、指派 reviewer、自动 mark ready、一次处理多个 issue。

## 常见问题

- **401** → token 无效或过期，重新生成（`api` scope）并更新 `GITLAB_TOKEN`。
- **issue 列表为空** → 当前项目没有分配给你的 open issue（按 token 所有者过滤）。
- **提示 "not a GitLab host"** → 当前仓库 origin 指向 GitHub 等非 GitLab 平台，用 `GITLAB_HOST` + `GITLAB_PROJECT` 指定目标项目。
- **建 MR 报 409** → 该分支已有 open MR，agent 会给出已存在 MR 的链接，不会重复创建。
- **分支名已存在** → agent 会问你复用还是改名，不会强制删除。
