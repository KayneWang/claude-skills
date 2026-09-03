# g

团队 git 规范的统一入口 `/g`：开分支 → 提交并推送 → 建 MR → 同步基准分支。规范靠护栏拦，不靠人记；macOS 和 Windows 都能用。

> 本文档讲**怎么配置和使用**。`SKILL.md` 是给 agent 看的执行指令，无需手动阅读。

## 命令

| 命令 | 做什么 |
| --- | --- |
| `/g` | 看你在流程的哪一步：当前分支、领先/落后基准、未推送数、MR 状态、待清理分支，并给出下一步建议 |
| `/g start <type> [jira单号] [描述]` | 从最新基准分支切分支。`/g start fix demo-111` → `fix/demo-111`；`/g start feat 登录记住我` → `feat/login-remember-me`（描述会翻成英文 slug，切之前给你确认） |
| `/g commit [描述]` | 生成 `type: 描述` 的 commit（type 从分支名推断）并**自动推送**。工作区干净时只推送 |
| `/g ship [assignee] [目标分支]` | 推送并创建 MR。`/g ship jane.doe` → 目标为基准分支、assignee 为 jane.doe；`/g ship jane.doe alpha` → 目标 alpha。标题自动拼成 `fix: demo-111 描述`，建之前给你确认 |
| `/g sync` | 回到基准分支，fast-forward 拉取，**自动删除**本地已合并的分支 |

type 只认六种：`feat`、`fix`、`chore`、`refactor`、`docs`、`test`。

## 规范是怎么落地的

- 基准分支每个仓库只有一个（main 或 develop），从 GitLab 项目的默认分支读取；没配 token 时退化为 `origin/HEAD`。
- 在基准分支上直接 `/g commit` 或 `/g ship` 会被拒绝，引导你先 `/g start`。
- commit 只带 type 前缀，不带单号；单号只出现在分支名和 MR 标题里。
- MR 非 Draft，合并后自动删源分支；assignee 设好后由外部服务发通知。
- `/g sync` 只用 `git branch -d` 删分支，未合并的分支 git 会拒绝并列在「删除失败」里，是否 `-D` 由你决定。

## 前置配置

### 1. GitLab Personal Access Token

`/g ship` 和状态面板里的 MR 信息需要它；`/g start`、`/g commit`、`/g sync` 没有 token 也能用。

在 GitLab 生成：`Preferences → Access Tokens` → 勾选 **`api`** scope → Create → 立刻复制。写进 shell 配置即可全局生效：

```bash
echo 'export GITLAB_TOKEN=<你的token>' >> ~/.zshrc   # Windows PowerShell: [Environment]::SetEnvironmentVariable("GITLAB_TOKEN","<token>","User")
```

> ⚠️ 不要把 token 写进任何会提交到 git 的文件。

### 2. 在目标项目仓库里运行

GitLab host 和项目路径从 `origin` remote 自动解析（自建 GitLab 也行）。解析不了时用环境变量覆盖：

```bash
export GITLAB_HOST=gitlab.mycorp.com     # 纯 http 内网实例写 http://gitlab.internal
export GITLAB_PROJECT=team/app           # 原始路径，不要 URL 编码
```

### 3. Windows

需要 Node 18+ 和 git 在 PATH 里。脚本不依赖 bash。

## 底层脚本（一般无需手动调）

```bash
node <skill-dir>/g.js status
node <skill-dir>/g.js base
node <skill-dir>/g.js branch-name <type> [jira] [slug]
node <skill-dir>/g.js start <name> [--description <d>]
node <skill-dir>/g.js push
node <skill-dir>/g.js mr-find
node <skill-dir>/g.js mr-create --title <t> (--description <d> | --description-file <path>) [--assignee <username>] [--target <branch>]
node <skill-dir>/g.js merged-branches
node <skill-dir>/g.js delete-branches <name...>
```

Node 18+，零 npm 依赖。测试：`npm test`。

## 范围与边界

- **做**：一个仓库、一个基准分支下的 start / commit / ship / sync / 状态面板。
- **不做**：rebase、把基准分支合进功能分支、MR 合并与 reviewer 字段、多仓库、Jira API、通知本身。

## 常见问题

- **无法确定基准分支** → 设置 `GITLAB_TOKEN`，或运行 `git remote set-head origin -a`。
- **Push rejected** → 这个分支在远端有别人的新提交，手动 `git pull` 后重试，agent 不会 force。
- **Not possible to fast-forward** → 本地基准分支上有误提交，`git log origin/main..main` 看一下，agent 不会自动 merge 或 rebase。
- **GitLab user "..." not found** → 请填 GitLab username（URL 里那个），不是显示名。
- **401** → token 无效或过期，重新生成（`api` scope）。
