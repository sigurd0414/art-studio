// @module templates/bin/task/cli/inspect
// @role 通用 task 工具的唯讀檢查與盤點指令：實作 scope-check、status、mine 及共用的範圍／行數驗證
// @why 將不更動 GitHub 與工作區狀態的檢查指令集中在唯讀模組，並讓 submit 共用範圍與行數檢查邏輯
// @forbid 禁止在唯讀盤點指令中修改 GitHub 狀態或工作區檔案

import fs from 'node:fs';
import path from 'node:path';
import { getLabelNames, normalizeSessionId } from '../lib.ts';
import type {
  IssueCommandArgs,
  IssueDiffSummary,
  MineCommandArgs,
  ScopeParseResult,
  TaskContext,
  TaskLib,
} from '../types.ts';
import {
  collectIssueDiffSummary,
  fail,
  fetchAllIssues,
  fetchIssueComments,
  fetchSingleIssue,
  usageError,
} from './runtime.ts';
import { formatWorkersStatusLines } from './workers.ts';
import { formatTaskBranch, getTaskDir } from './worktrees.ts';

export interface VerifyIssueScopeAndLinesOptions {
  issueNum: number;
  targetBody: string | null | undefined;
  scope: ScopeParseResult;
  branchName: string;
  taskDir: string;
  failPrefix: string;
}

/**
 * 執行影響範圍與業務程式行數檢查；通過時印出單檔軟上限警告並回傳差異摘要。
 */
export function verifyIssueScopeAndLines(
  ctx: TaskContext,
  { issueNum, targetBody, scope, branchName, taskDir, failPrefix }: VerifyIssueScopeAndLinesOptions,
): IssueDiffSummary {
  const summary = collectIssueDiffSummary(ctx, {
    issueNum,
    targetBody,
    branchName,
    taskDir,
    checkSoftLineLimit: true,
  });

  const outOfScope = ctx.lib.findOutOfScopeFiles(summary.changedFiles, scope.entries);
  if (outOfScope.length > 0) {
    fail(`${failPrefix}：以下變更檔不在影響範圍內：\n${outOfScope.map((f) => `- ${f.raw}`).join('\n')}`);
  }

  if (summary.lineCheck.exceeded) {
    const fileLinesText = summary.lineCheck.files
      .map(
        (f) => `- ${f.raw}：+${f.added} 行${f.movedCount > 0 ? `（含搬移抵銷 ${f.movedCount} 行）` : ''}`,
      )
      .join('\n');
    fail(
      [
        `${failPrefix}：業務程式新增行數超過上限（目前 ${summary.lineCheck.totalAdded} 行，上限 ${summary.lineCheck.limit} 行）。`,
        '各檔行數：',
        fileLinesText || '（無）',
      ].join('\n'),
    );
  }

  for (const w of summary.fileLineWarnings) {
    console.warn(`⚠️ 警告：${w.raw} 目前有 ${w.lineCount} 行，超過單檔 ${ctx.lib.softFileLineLimit} 行軟上限。`);
  }

  return summary;
}

export function parseValidatedScope(
  lib: TaskLib,
  issueNum: number,
  body: string | null | undefined,
  failPrefix: string,
): ScopeParseResult {
  const scope = lib.parseScopeSection(body);
  if (scope.invalidRepo) {
    fail(`${failPrefix}：issue #${issueNum} 影響範圍包含不認得的倉庫代號或格式錯誤（${scope.invalidRepo}）`);
  }
  if (!scope.hasSection || scope.entries.length === 0) {
    fail(`${failPrefix}：issue #${issueNum} 缺少「影響範圍」段落或內容為空`);
  }
  return scope;
}

export function cmdScopeCheck(ctx: TaskContext, { issueNum }: Pick<IssueCommandArgs, 'issueNum'>): number {
  const target = fetchSingleIssue(ctx, issueNum);
  if (!target) fail(`找不到 issue #${issueNum}`);

  const scope = parseValidatedScope(ctx.lib, issueNum, target.body, `scope-check #${issueNum} 失敗`);
  const summary = verifyIssueScopeAndLines(ctx, {
    issueNum,
    targetBody: target.body,
    scope,
    branchName: formatTaskBranch(ctx, issueNum),
    taskDir: getTaskDir(ctx, issueNum),
    failPrefix: `scope-check #${issueNum} 失敗`,
  });

  const moveNote = summary.lineCheck.totalMoved > 0 ? `，搬移抵銷 ${summary.lineCheck.totalMoved} 行` : '';
  console.log(
    `scope-check #${issueNum} 通過：檢查 ${summary.checkedBranches} 個任務分支，共 ${summary.changedFiles.length} 個變更檔皆在影響範圍內（業務程式新增 ${summary.lineCheck.totalAdded}／${summary.lineCheck.limit} 行${moveNote}）`,
  );
  return 0;
}

export function cmdStatus(ctx: TaskContext): number {
  const issues = fetchAllIssues(ctx);
  const inProgressIssues = issues.filter(
    (it) => it.state === 'open' && getLabelNames(it).includes('status:in-progress'),
  );
  const readyIssues = issues
    .filter((it) => it.state === 'open' && getLabelNames(it).includes('status:ready'))
    .sort((a, b) => a.number - b.number);

  const inProgressDirNames = new Set<string>();
  console.log('=== 進行中任務（status:in-progress）===');
  if (inProgressIssues.length === 0) {
    console.log('（無）');
  } else {
    for (const it of inProgressIssues) {
      const dirName = `${ctx.project}-${it.number}`;
      inProgressDirNames.add(dirName);
      const dirPath = path.join(ctx.worktreeRoot, dirName);
      const stateText = fs.existsSync(dirPath) ? '資料夾存在' : '資料夾不存在';
      console.log(`- #${it.number} ${it.title || ''}：${dirPath}（${stateText}）`);
    }
  }

  console.log(`\n=== 可交辦任務（status:ready）：共 ${readyIssues.length} 張 ===`);
  for (const it of readyIssues) {
    console.log(`- #${it.number} ${it.title || ''}`.trimEnd());
  }
  if (readyIssues.length < 2) {
    console.log('提醒：可交辦的任務少於 2 張，實作可能會空等');
  }

  console.log('\n=== 殘留資料夾檢查 ===');
  if (fs.existsSync(ctx.worktreeRoot)) {
    const entries = fs.readdirSync(ctx.worktreeRoot, { withFileTypes: true });
    const leftovers = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !inProgressDirNames.has(e.name))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (leftovers.length === 0) {
      console.log('（無）');
    } else {
      for (const d of leftovers) {
        console.log(`- 殘留資料夾：${path.join(ctx.worktreeRoot, d.name)}`);
      }
    }
  } else {
    console.log('（無）');
  }
  for (const line of formatWorkersStatusLines(ctx)) {
    console.log(line);
  }
  return 0;
}

export function cmdMine(ctx: TaskContext, { sessionArg }: Pick<MineCommandArgs, 'sessionArg'>): number {
  const sessionId = normalizeSessionId(sessionArg);
  if (!sessionId) usageError('用法：task.mjs mine <對話連結或代號>');

  const owned = fetchAllIssues(ctx)
    .filter((it) => it.state === 'open' && ctx.lib.isIssueOwnedBySession(it, sessionId))
    .sort((a, b) => a.number - b.number);

  let pending = 0;
  console.log(`=== 由 ${sessionId} 負責、還開著的單：共 ${owned.length} 張 ===`);
  for (const it of owned) {
    const comments = fetchIssueComments(ctx, it.number);
    const { action, reason } = ctx.lib.classifyOwnedIssue(it, comments);
    const statusLabels =
      getLabelNames(it)
        .filter((l) => l.startsWith('status:'))
        .join(',') || '無狀態';
    if (action) pending += 1;
    console.log(
      `${action ? `【${action}】` : '  '}#${it.number} [${statusLabels}] ${it.title || ''}${reason ? `：${reason}` : ''}`,
    );
  }
  if (owned.length === 0) console.log('（無）');
  return pending > 0 ? 3 : 0;
}
