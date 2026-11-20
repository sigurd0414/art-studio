// @module templates/bin/task/cli/worktrees
// @role 通用 task 工具的工作資料夾與分支操作模組：驗證未推送分支、解析工作區狀態、建立多倉庫 worktree 並支援失敗原子回滾
// @why 將 start 與 resume 共用的 worktree 建立、回滾與狀態解析集中一處，避免重複實作並確保失敗不留半成品
// @forbid 禁止在未預先檢查本機未推送分支前覆蓋分支，或於建立 worktree 失敗後殘留半成品與錯誤標籤

import fs from 'node:fs';
import path from 'node:path';
import type { ProjectConfig, ScopeEntry, ScopeParseResult, TaskContext, TaskLib } from '../types.ts';
import {
  addIssueLabel,
  fail,
  postIssueComment,
  removeIssueLabel,
  resolveBaseRef,
  runGit,
  swapIssueLabels,
} from './runtime.ts';

export interface GitStatusPorcelainEntry {
  xy: string;
  path: string;
}

export interface WorktreePreflightOptions {
  taskDir: string;
  branchName: string;
  affectedRepos: ReadonlySet<string>;
  actionLabel?: string;
}

export interface ClaimAndBuildWorktreesOptions {
  issueNum: number;
  worker: string;
  taskDir: string;
  branchName: string;
  affectedRepos: ReadonlySet<string>;
  addLabel: string;
  removeLabel: string;
  actionLabel?: string;
}

export function formatTaskBranch(ctx: Pick<TaskContext, 'branchPattern'>, issueNum: number): string {
  return ctx.branchPattern.replaceAll('{N}', String(issueNum));
}

export function getTaskDir(ctx: Pick<TaskContext, 'worktreeRoot' | 'project'>, issueNum: number): string {
  return path.join(ctx.worktreeRoot, `${ctx.project}-${issueNum}`);
}

export function getAffectedRepoKeys(scope: Pick<ScopeParseResult, 'entries'> | null | undefined): Set<string> {
  return new Set((scope?.entries || []).map((e) => e.repo));
}

/**
 * 解析 `git -c core.quotepath=false status --porcelain -z -uall` 的輸出。
 * @why `-z` 以 NUL 分隔且不做引號跳脫，能安全處理含空白或非 ASCII 字元的路徑。
 */
export function parseGitStatusPorcelainZ(raw: string | null | undefined): GitStatusPorcelainEntry[] {
  const text = String(raw || '');
  if (!text) return [];
  const parts = text.split('\0');
  const entries: GitStatusPorcelainEntry[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    const rec = parts[i];
    if (!rec || rec.length < 4) continue;
    const xy = rec.slice(0, 2);
    const filePath = rec.slice(3);
    if (xy[0] === 'R' || xy[0] === 'C' || xy[1] === 'R' || xy[1] === 'C') {
      i += 1;
    }
    if (filePath) entries.push({ xy, path: filePath });
  }
  return entries;
}

export function parseSharedGeneratedEntries(
  config: Pick<ProjectConfig, 'sharedGenerated'> | null | undefined,
): ScopeEntry[] {
  const rawList = Array.isArray(config?.sharedGenerated) ? config.sharedGenerated : [];
  const entries: ScopeEntry[] = [];
  for (const item of rawList) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    const idx = trimmed.indexOf(':');
    if (idx === -1) continue;
    const repo = trimmed.slice(0, idx).trim();
    const pattern = trimmed.slice(idx + 1).trim().replace(/^\/+|\/+$/g, '');
    if (repo && pattern) entries.push({ raw: `${repo}:${pattern}`, repo, pattern });
  }
  return entries;
}

export function isSharedGeneratedFile(
  lib: TaskLib,
  sharedEntries: readonly ScopeEntry[] | null | undefined,
  repoKey: string,
  filePath: string | null | undefined,
): boolean {
  if (!sharedEntries || sharedEntries.length === 0) return false;
  const cleanPath = String(filePath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!cleanPath) return false;
  return sharedEntries.some((entry) =>
    lib.fileMatchesScopeEntry({ raw: `${repoKey}:${cleanPath}`, repo: repoKey, pattern: cleanPath }, entry),
  );
}

export function checkLocalUnpushedBranch(
  mainRepoPath: string,
  repoName: string,
  branchName: string,
  targetStartPoint: string,
  actionLabel = '開工',
): boolean {
  const hasLocalBranch = runGit(mainRepoPath, [
    'rev-parse',
    '--verify',
    '-q',
    `refs/heads/${branchName}`,
  ]).ok;
  if (!hasLocalBranch) return false;

  const isAncestor = runGit(mainRepoPath, [
    'merge-base',
    '--is-ancestor',
    `refs/heads/${branchName}`,
    targetStartPoint,
  ]).ok;
  if (!isAncestor) {
    fail(
      `拒絕${actionLabel}：${repoName} 本機已有分支 ${branchName} 且有還沒推到 ${targetStartPoint} 的提交，不能直接覆蓋`,
    );
  }
  return true;
}

/** 在修改 GitHub 或抓取遠端前執行純本機前置檢查。 */
export function preflightLocalWorktreeBuild(
  ctx: TaskContext,
  { taskDir, branchName, affectedRepos, actionLabel = '開工' }: WorktreePreflightOptions,
): void {
  if (fs.existsSync(taskDir)) {
    fail(`拒絕${actionLabel}：工作資料夾 ${taskDir} 已存在`);
  }
  for (const repo of ctx.repos) {
    if (!fs.existsSync(repo.mainRepoPath)) {
      fail(`拒絕${actionLabel}：找不到倉庫資料夾 ${repo.mainRepoPath}`);
    }
    if (affectedRepos.has(repo.key)) {
      const hasKnownRemote = runGit(repo.mainRepoPath, [
        'rev-parse',
        '--verify',
        '-q',
        `refs/remotes/origin/${branchName}`,
      ]).ok;
      const compareRef = hasKnownRemote ? `origin/${branchName}` : resolveBaseRef(repo.mainRepoPath);
      checkLocalUnpushedBranch(repo.mainRepoPath, repo.name, branchName, compareRef, actionLabel);
    }
  }
}

/**
 * 先搶標籤再建立多倉庫 worktree；若途中任一步失敗則清理半成品、還原標籤並留言說明原因。
 */
export function claimLabelsAndBuildWorktrees(
  ctx: TaskContext,
  {
    issueNum,
    worker,
    taskDir,
    branchName,
    affectedRepos,
    addLabel,
    removeLabel,
    actionLabel = '開工',
  }: ClaimAndBuildWorktreesOptions,
): string[] {
  swapIssueLabels(ctx, issueNum, addLabel, removeLabel);

  let createdTaskDir = false;
  const createdWorktrees: Array<{ mainRepoPath: string; wtPath: string }> = [];
  const createdBranches: Array<{ mainRepoPath: string; branch: string }> = [];
  const branchSummaryLines: string[] = [];

  try {
    for (const repo of ctx.repos) {
      const fetchRes = runGit(repo.mainRepoPath, ['fetch', 'origin']);
      if (!fetchRes.ok) {
        fail(`拒絕${actionLabel}：${repo.name} 執行 git fetch 失敗：${fetchRes.stderr || fetchRes.stdout}`);
      }
    }

    const startPoints = new Map<string, string>();
    const preExistingLocalBranches = new Set<string>();
    for (const repo of ctx.repos) {
      if (!affectedRepos.has(repo.key)) continue;
      const hasRemoteBranch = runGit(repo.mainRepoPath, [
        'rev-parse',
        '--verify',
        '-q',
        `refs/remotes/origin/${branchName}`,
      ]).ok;
      const baseRef = resolveBaseRef(repo.mainRepoPath);
      const startPoint = hasRemoteBranch ? `origin/${branchName}` : baseRef;
      startPoints.set(repo.key, startPoint);
      if (checkLocalUnpushedBranch(repo.mainRepoPath, repo.name, branchName, startPoint, actionLabel)) {
        preExistingLocalBranches.add(repo.key);
      }
    }

    fs.mkdirSync(taskDir);
    createdTaskDir = true;

    for (const repo of ctx.repos) {
      const wtPath = path.join(taskDir, repo.name);
      runGit(repo.mainRepoPath, ['worktree', 'prune']);
      if (affectedRepos.has(repo.key)) {
        const startPoint = startPoints.get(repo.key) || resolveBaseRef(repo.mainRepoPath);
        const addRes = runGit(repo.mainRepoPath, ['worktree', 'add', '-B', branchName, wtPath, startPoint]);
        if (!addRes.ok) {
          fail(`建立 ${repo.name} worktree 失敗：${addRes.stderr || addRes.stdout}`);
        }
        createdWorktrees.push({ mainRepoPath: repo.mainRepoPath, wtPath });
        if (!preExistingLocalBranches.has(repo.key)) {
          createdBranches.push({ mainRepoPath: repo.mainRepoPath, branch: branchName });
        }
        branchSummaryLines.push(`- \`${repo.name}\`（\`${repo.key}\`）：\`${branchName}\`（起點：\`${startPoint}\`）`);
      } else {
        const baseRef = resolveBaseRef(repo.mainRepoPath);
        const addRes = runGit(repo.mainRepoPath, ['worktree', 'add', '--detach', wtPath, baseRef]);
        if (!addRes.ok) {
          fail(`建立 ${repo.name} detached worktree 失敗：${addRes.stderr || addRes.stdout}`);
        }
        createdWorktrees.push({ mainRepoPath: repo.mainRepoPath, wtPath });
        branchSummaryLines.push(`- \`${repo.name}\`（\`${repo.key}\`）：\`${baseRef}\` (detached)`);
      }
    }
  } catch (err: unknown) {
    for (const { mainRepoPath, wtPath } of createdWorktrees) {
      runGit(mainRepoPath, ['worktree', 'remove', '--force', wtPath]);
      runGit(mainRepoPath, ['worktree', 'prune']);
    }
    for (const { mainRepoPath, branch } of createdBranches) {
      runGit(mainRepoPath, ['branch', '-D', branch]);
    }
    if (createdTaskDir) {
      fs.rmSync(taskDir, { recursive: true, force: true });
    }

    const rollbackErrors: string[] = [];
    try {
      removeIssueLabel(ctx, issueNum, addLabel);
    } catch (rbErr: unknown) {
      rollbackErrors.push(rbErr instanceof Error ? rbErr.message : String(rbErr));
    }
    try {
      addIssueLabel(ctx, issueNum, removeLabel);
    } catch (rbErr: unknown) {
      rollbackErrors.push(rbErr instanceof Error ? rbErr.message : String(rbErr));
    }

    try {
      const failReason = err instanceof Error ? err.message : String(err);
      const rollbackNote = rollbackErrors.length > 0 ? `\n\n標籤還原警告：${rollbackErrors.join('；')}` : '';
      const errComment = [
        `🛠️ ${worker}`,
        `${actionLabel}失敗，已還原狀態（標籤改回 \`${removeLabel}\`、清理未完成的工作資料夾）：`,
        '',
        failReason + rollbackNote,
      ].join('\n');
      postIssueComment(ctx, issueNum, errComment);
    } catch {}

    throw err;
  }

  return branchSummaryLines;
}
