// @module templates/bin/task/cli/request
// @role 通用 task 工具的跨專案部門需求單模組：實作 task request（向外部部門開單並回原單留言）與 task request-result（回寫驗收結果並同步原單）
// @why 讓需求方規劃者透過設定檔外部部門清單建立並追蹤跨倉庫需求單，維持部門不自關單、驗收權在需求方的協作規範
// @forbid 禁止在 --dry-run 或前置檢查未通過時寫入 GitHub、在需求方倉庫建立部門單、或允許實作者執行此模組指令

import fs from 'node:fs';
import path from 'node:path';
import { extractSection, getLabelNames } from '../lib.ts';
import type {
  GitHubIssue,
  RequestCommandArgs,
  RequestResultCommandArgs,
  TaskContext,
} from '../types.ts';
import {
  TaskFailure,
  addIssueLabel,
  closeRepoIssue,
  createRepoIssue,
  fail,
  fetchAllIssues,
  fetchSingleIssue,
  postIssueComment,
  removeIssueLabel,
  resolveExternalDepartment,
  usageError,
} from './runtime.ts';

const SOURCE_LINE_RE = /^需求來源\s*[:：]\s*([^/\s#]+\/[^/\s#]+)#([1-9]\d*)(?:\s|$)/;

function readRequestBodyText(body: string | null, bodyFile: string | null): string {
  if (bodyFile === null) {
    return (body ?? '').replace(/\r\n/g, '\n');
  }
  const resolved = path.resolve(process.cwd(), bodyFile);
  let text: string;
  try {
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) {
      fail(`讀取 --body-file 失敗：${bodyFile} 不是一般檔案`);
    }
    text = fs.readFileSync(resolved, 'utf8');
  } catch (err: unknown) {
    if (err instanceof TaskFailure) throw err;
    fail(`讀取 --body-file 失敗（${bodyFile}）：${err instanceof Error ? err.message : String(err)}`);
  }
  return text.replace(/\r\n/g, '\n');
}

function findExistingOpenDeptIssue(
  issues: readonly GitHubIssue[],
  title: string,
  expectedSourceLine: string,
): GitHubIssue | null {
  for (const issue of issues) {
    if (issue.state !== 'open') continue;
    if ((issue.title ?? '').trim() !== title) continue;
    const firstLine = String(issue.body ?? '').replace(/\r\n/g, '\n').split('\n')[0].trim();
    if (firstLine === expectedSourceLine) return issue;
  }
  return null;
}

function replaceStatusLabelsWithRework(ctx: TaskContext, repo: string, issue: GitHubIssue): void {
  const statusLabels = getLabelNames(issue).filter((label) => label.startsWith('status:'));
  const hasRework = statusLabels.includes('status:rework');
  if (!hasRework) {
    addIssueLabel(ctx, issue.number, 'status:rework', repo);
  }
  try {
    for (const label of statusLabels) {
      if (label !== 'status:rework') {
        removeIssueLabel(ctx, issue.number, label, repo);
      }
    }
  } catch (err: unknown) {
    if (!hasRework) {
      try {
        removeIssueLabel(ctx, issue.number, 'status:rework', repo);
      } catch {}
    }
    throw err;
  }
}

function parseSourceRefFromFirstLine(body: string | null | undefined): { repo: string; issueNum: number } | null {
  const firstLine = String(body ?? '').replace(/\r\n/g, '\n').split('\n')[0].trim();
  const match = SOURCE_LINE_RE.exec(firstLine);
  if (!match) return null;
  const issueNum = Number(match[2]);
  if (!Number.isSafeInteger(issueNum) || issueNum <= 0) return null;
  return { repo: match[1], issueNum };
}

/** 執行 `task request`：在外部部門倉庫建立需求單，並在需求方原單留下連結留言（支援不重複開單與 --dry-run）。 */
export function cmdRequest(ctx: TaskContext, opts: RequestCommandArgs): number {
  const dept = resolveExternalDepartment(ctx, opts.dept);
  const bodyText = readRequestBodyText(opts.body, opts.bodyFile);
  const acceptanceSection = extractSection(bodyText, '驗收條件');
  if (acceptanceSection === null || !acceptanceSection.trim()) {
    usageError('用法錯誤：部門需求單內文必須包含非空的「## 驗收條件」段落');
  }

  const sourceIssue = fetchSingleIssue(ctx, opts.from);
  if (!sourceIssue) {
    fail(`找不到需求方原單 ${ctx.issueRepo}#${opts.from}`);
  }
  if (sourceIssue.state !== 'open') {
    fail(`需求方原單 ${ctx.issueRepo}#${opts.from} 已關閉，無法建立部門需求單`);
  }

  const sourceRef = `${ctx.issueRepo}#${opts.from}`;
  const expectedSourceLine = `需求來源：${sourceRef}`;
  const cleanBody = bodyText.replace(/^\n+/, '');
  const deptBody = `${expectedSourceLine}\n\n${cleanBody}`;
  const deptLabels = ['type:feature', 'status:ready', `role:${dept.role}`];

  if (opts.dryRun) {
    console.log(`[dry-run] 部門：${dept.code}（${dept.repo}）`);
    console.log(`TITLE=${opts.title}`);
    console.log(`LABELS=${deptLabels.join(', ')}`);
    console.log('---');
    console.log(deptBody);
    return 0;
  }

  const existing = findExistingOpenDeptIssue(fetchAllIssues(ctx, dept.repo), opts.title, expectedSourceLine);
  if (existing) {
    console.log(`REQUEST_ISSUE=${dept.repo}#${existing.number}`);
    return 0;
  }

  const createdNum = createRepoIssue(dept.repo, {
    title: opts.title,
    body: deptBody,
    labels: deptLabels,
  });

  const sourceComment = [
    '🤖 Claude',
    '📨 部門需求單',
    '',
    `部門：\`${dept.code}\``,
    `需求單：${dept.repo}#${createdNum}`,
    `標題：${opts.title}`,
  ].join('\n');
  postIssueComment(ctx, opts.from, sourceComment);

  console.log(`REQUEST_ISSUE=${dept.repo}#${createdNum}`);
  return 0;
}

/** 執行 `task request-result`：將需求方驗收結果（pass|fail）寫回部門需求單並同步留言至需求方原單。 */
export function cmdRequestResult(ctx: TaskContext, opts: RequestResultCommandArgs): number {
  const dept = resolveExternalDepartment(ctx, opts.dept);
  const deptIssue = fetchSingleIssue(ctx, opts.issueNum, dept.repo);
  if (!deptIssue) {
    fail(`找不到部門需求單 ${dept.repo}#${opts.issueNum}`);
  }

  const statusLine = opts.result === 'pass' ? '✅ 需求方驗收通過' : '↩️ 需求方退回';
  const commentBody = [
    `🤖 Claude（${ctx.project}）`,
    statusLine,
    `部門需求單：${dept.repo}#${opts.issueNum}`,
    '',
    opts.note,
  ].join('\n');

  postIssueComment(ctx, opts.issueNum, commentBody, dept.repo);
  if (opts.result === 'pass') {
    closeRepoIssue(dept.repo, opts.issueNum);
  } else {
    replaceStatusLabelsWithRework(ctx, dept.repo, deptIssue);
  }

  const sourceRef = parseSourceRefFromFirstLine(deptIssue.body);
  if (!sourceRef) {
    console.log(`提醒：${dept.repo}#${opts.issueNum} 內文第一行無法解析「需求來源：<owner/repo>#<N>」，只寫入部門單。`);
  } else if (sourceRef.repo.toLowerCase() !== ctx.issueRepo.toLowerCase()) {
    console.log(
      `提醒：${dept.repo}#${opts.issueNum} 的需求來源為 ${sourceRef.repo}#${sourceRef.issueNum}（非目前倉庫 ${ctx.issueRepo}），只寫入部門單。`,
    );
  } else {
    try {
      postIssueComment(ctx, sourceRef.issueNum, commentBody);
    } catch (err: unknown) {
      const detail =
        err instanceof TaskFailure
          ? err.ghDetail || err.message
          : err instanceof Error
            ? err.message
            : '';
      if (/\b404\b|Not Found/i.test(detail)) {
        console.log(`提醒：找不到需求方原單 ${ctx.issueRepo}#${sourceRef.issueNum}，只寫入部門單。`);
      } else {
        throw err;
      }
    }
  }

  console.log(`已回寫驗收結果（${opts.result}）：${dept.repo}#${opts.issueNum}`);
  return 0;
}
