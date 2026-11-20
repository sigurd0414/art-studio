// @module templates/bin/task/cli/merge
// @role 通用 task 工具的合併指令模組：實作 task merge（驗證交件與證據包一致後於暫存工作資料夾合併推上 main 並關單）
// @why 讓規劃者在審查證據包後以單一指令安全完成多倉庫合併、留言與關單，不動主資料夾且失敗時可追溯
// @forbid 禁止在未通過交件與證據包驗證前寫入 GitHub 或推送、在主資料夾切換分支，或於任一倉庫失敗後仍留言關單

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getLabelNames } from '../lib.ts';
import type {
  GitHubComment,
  GitHubIssue,
  MergeCommandArgs,
  RuntimeRepo,
  TaskContext,
} from '../types.ts';
import {
  fail,
  fetchIssueComments,
  fetchSingleIssue,
  postIssueComment,
  removeIssueLabel,
  runGh,
  runGit,
} from './runtime.ts';

const ORIGIN_MAIN_REF = 'refs/remotes/origin/main';
const DELIVER_LINE_RE = /^\s*-\s+`?([^`:：\s]+)`?\s*[:：]\s*`?([^\s`]+)`?\s+@\s+`?([0-9a-fA-F]{7,40})`?\s*$/;
const EVIDENCE_HEADING_RE = /^##\s+驗收證據包\s*[:：]\s*#(\d+)\s*→\s*(\S+)\s*$/;
const ROLE_PAIR_ROW_RE = /^\|\s*驗收員代號\s*[／/]\s*交件者代號\s*\|\s*(.+?)\s*\|\s*$/;
const REPO_HEADING_RE = /^###\s+倉庫\s*[:：].*[（(]\s*`?([^`)）\s]+)`?\s*[）)]\s*$/;
const BRANCH_COMMIT_ROW_RE = /^\|\s*分支\s*commit\s*\|\s*`?([0-9a-fA-F]{7,40})`?\s*\|\s*$/;

interface DeliveredRepoCommit {
  branchName: string;
  commitSha: string;
}

interface DeliveredRepoItem extends DeliveredRepoCommit {
  repo: RuntimeRepo;
}

type DeliveryLookupResult =
  | { ok: false; reason: string }
  | { ok: true; noCommit: boolean; lastDeliverIdx: number; deliveredByKey: Map<string, DeliveredRepoCommit> };

interface RolePair {
  verifier: string;
  deliverer: string;
}

interface ParsedEvidence {
  verdict: string | null;
  rolePair: RolePair | null;
  duplicateRepo: string | null;
  repoCommits: Map<string, string>;
}

type ValidationOutcome = { ok: true } | { ok: false; reason: string };

type MergePreconditionResult =
  | { ok: false; code: number }
  | { ok: true; noCommit: true; target: GitHubIssue; deliveredRepos: [] }
  | { ok: true; noCommit: false; target: GitHubIssue; deliveredRepos: DeliveredRepoItem[] };

type SingleRepoMergeResult =
  | { ok: true; mergeCommitSha: string }
  | { ok: false; code: number };

interface MergedRepoCommit {
  key: string;
  mergeCommitSha: string;
}

function normalizeLines(text: string | null | undefined): string[] {
  return String(text || '').replace(/\r\n/g, '\n').split('\n');
}

function sortCommentsChronologically(comments: readonly GitHubComment[] | null | undefined): GitHubComment[] {
  return (Array.isArray(comments) ? comments : [])
    .filter((c): c is GitHubComment => Boolean(c && typeof c === 'object'))
    .slice()
    .sort((a, b) => (Date.parse(a.created_at || '') || 0) - (Date.parse(b.created_at || '') || 0));
}

function resolveSafeChildPath(parentDir: string, childName: string, label: string): string {
  const name = String(childName || '').trim();
  if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\\') || name.includes('\0')) {
    fail(`拒絕合併：${label}名稱不合法（${childName}）`);
  }
  const resolved = path.resolve(parentDir, name);
  const rel = path.relative(parentDir, resolved);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    fail(`拒絕合併：${label}路徑超出範圍（${childName}）`);
  }
  return resolved;
}

function getMergeBaseDir(ctx: TaskContext): string {
  const rawTmp = os.tmpdir();
  fs.mkdirSync(rawTmp, { recursive: true });
  const tmpRoot = fs.realpathSync(rawTmp);
  return resolveSafeChildPath(path.join(tmpRoot, 'task-merge'), ctx.project, '專案');
}

function pathExistsIncludingSymlink(targetPath: string): boolean {
  try {
    fs.lstatSync(targetPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 清除暫存合併工作資料夾（含壞掉的符號連結），並修剪主倉庫 worktree 紀錄。
 * @why 合併成功、衝突中止或發生異常時都必須還原乾淨，避免殘留鎖住後續工作或測試。
 */
function clearTempWorktree(mainRepoPath: string, wtPath: string): void {
  if (pathExistsIncludingSymlink(wtPath)) {
    if (mainRepoPath && fs.existsSync(mainRepoPath)) {
      runGit(mainRepoPath, ['worktree', 'remove', '--force', wtPath]);
    }
    try {
      fs.rmSync(wtPath, { recursive: true, force: true });
    } catch {}
  }
  if (mainRepoPath && fs.existsSync(mainRepoPath)) {
    runGit(mainRepoPath, ['worktree', 'prune']);
  }
}

function findLastDelivery(ctx: TaskContext, sortedComments: readonly GitHubComment[]): DeliveryLookupResult {
  let lastDeliverIdx = -1;
  for (let i = 0; i < sortedComments.length; i += 1) {
    const text = String(sortedComments[i].body || '').replace(/\r\n/g, '\n');
    const firstLine = text.split('\n')[0].trimStart();
    if (firstLine.startsWith('🛠') && text.includes('📦 交件')) {
      lastDeliverIdx = i;
    }
  }
  if (lastDeliverIdx === -1) {
    return { ok: false, reason: '找不到實作者的交件留言（需含「📦 交件」）' };
  }

  const lines = normalizeLines(sortedComments[lastDeliverIdx].body);
  const isSecondLineNoCommit = lines.length >= 2 && lines[1].trim() === '📦 交件（零提交）';
  if (isSecondLineNoCommit) {
    return { ok: true, noCommit: true, lastDeliverIdx, deliveredByKey: new Map() };
  }

  const deliveredByKey = new Map<string, DeliveredRepoCommit>();
  for (const rawLine of lines) {
    const match = DELIVER_LINE_RE.exec(rawLine);
    if (!match) continue;
    const repoKey = match[1];
    const branchName = match[2];
    const commitSha = match[3].toLowerCase();
    if (!ctx.repoByKey.has(repoKey)) {
      return { ok: false, reason: `交件留言包含未知倉庫代號「${repoKey}」` };
    }
    if (deliveredByKey.has(repoKey)) {
      return { ok: false, reason: `交件留言重複列出倉庫「${repoKey}」` };
    }
    deliveredByKey.set(repoKey, { branchName, commitSha });
  }

  if (deliveredByKey.size === 0) {
    if (lines.some((l) => l.includes('📦 交件（零提交）'))) {
      return { ok: true, noCommit: true, lastDeliverIdx, deliveredByKey: new Map() };
    }
    return { ok: false, reason: '交件留言沒有可解析的倉庫分支與 commit 行' };
  }
  return { ok: true, noCommit: false, lastDeliverIdx, deliveredByKey };
}

function parseEvidenceComment(lines: readonly string[], issueNum: number): ParsedEvidence {
  let verdict: string | null = null;
  let rolePair: RolePair | null = null;
  let currentRepoKey: string | null = null;
  let duplicateRepo: string | null = null;
  const repoCommits = new Map<string, string>();
  let fence: string | null = null;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    const fenceMatch = /^(`{3,}|~{3,})/.exec(trimmed);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1][0];
      else if (fenceMatch[1][0] === fence) fence = null;
      continue;
    }
    if (fence) continue;

    if (verdict === null) {
      const headingMatch = EVIDENCE_HEADING_RE.exec(trimmed);
      if (headingMatch && Number(headingMatch[1]) === issueNum) {
        verdict = headingMatch[2];
        continue;
      }
    }

    if (rolePair === null) {
      const roleMatch = ROLE_PAIR_ROW_RE.exec(trimmed);
      if (roleMatch) {
        const parts = roleMatch[1].split(/[／/]/).map((s) => s.trim().replace(/^`|`$/g, '').trim());
        if (parts.length === 2 && parts[0] && parts[1]) {
          rolePair = { verifier: parts[0], deliverer: parts[1] };
        }
        continue;
      }
    }

    if (/^#{1,6}\s+/.test(trimmed)) {
      const repoMatch = REPO_HEADING_RE.exec(trimmed);
      if (repoMatch) {
        currentRepoKey = repoMatch[1];
        if (repoCommits.has(currentRepoKey)) {
          duplicateRepo = currentRepoKey;
        }
      } else {
        currentRepoKey = null;
      }
      continue;
    }

    if (currentRepoKey !== null) {
      const commitMatch = BRANCH_COMMIT_ROW_RE.exec(trimmed);
      if (commitMatch && !repoCommits.has(currentRepoKey)) {
        repoCommits.set(currentRepoKey, commitMatch[1].toLowerCase());
      }
    }
  }

  return { verdict, rolePair, duplicateRepo, repoCommits };
}

function findAndValidateEvidence(
  sortedComments: readonly GitHubComment[],
  lastDeliverIdx: number,
  issueNum: number,
  override: string | null,
  deliveredByKey: ReadonlyMap<string, DeliveredRepoCommit>,
): ValidationOutcome {
  const afterDelivery = sortedComments.slice(lastDeliverIdx + 1);
  let latestParsed: ParsedEvidence | null = null;

  for (const comment of afterDelivery) {
    const lines = normalizeLines(comment.body);
    if (!lines[0].trimStart().startsWith('🧪')) continue;
    const parsed = parseEvidenceComment(lines, issueNum);
    if (parsed.verdict !== null) {
      latestParsed = parsed;
    }
  }

  if (!latestParsed) {
    return { ok: false, reason: `交件後找不到 #${issueNum} 的驗收證據包` };
  }

  if (latestParsed.verdict !== 'PASS' && (!override || !override.trim())) {
    return { ok: false, reason: `驗收證據包結果為 ${latestParsed.verdict}，需指定 --override "<理由>" 才能合併` };
  }

  if (!latestParsed.rolePair) {
    return { ok: false, reason: '驗收證據包缺少「驗收員代號／交件者代號」列或格式不完整' };
  }
  if (latestParsed.rolePair.verifier === latestParsed.rolePair.deliverer) {
    return {
      ok: false,
      reason: `驗收員代號（${latestParsed.rolePair.verifier}）不可與交件者代號（${latestParsed.rolePair.deliverer}）相同`,
    };
  }

  if (latestParsed.duplicateRepo) {
    return { ok: false, reason: `驗收證據包重複出現倉庫段落「${latestParsed.duplicateRepo}」` };
  }

  for (const [repoKey, info] of deliveredByKey.entries()) {
    const evSha = latestParsed.repoCommits.get(repoKey);
    if (!evSha) {
      return { ok: false, reason: `驗收證據包缺少倉庫「${repoKey}」的分支 commit` };
    }
    if (evSha !== info.commitSha) {
      return {
        ok: false,
        reason: `倉庫「${repoKey}」的證據包分支 commit（${evSha}）與交件 commit（${info.commitSha}）不符`,
      };
    }
  }

  return { ok: true };
}

function verifyRemoteBranches(deliveredRepos: readonly DeliveredRepoItem[]): ValidationOutcome {
  for (const item of deliveredRepos) {
    const { repo, branchName, commitSha } = item;
    if (!fs.existsSync(repo.mainRepoPath)) {
      fail(`合併失敗：找不到倉庫資料夾 ${repo.mainRepoPath}`);
    }

    const fetchMain = runGit(repo.mainRepoPath, ['fetch', '-q', 'origin', '+refs/heads/main:refs/remotes/origin/main']);
    if (!fetchMain.ok) {
      fail(`合併失敗：抓取 ${repo.name} 的 origin/main 失敗：${fetchMain.stderr || fetchMain.stdout || '未知錯誤'}`);
    }

    const fetchBranch = runGit(repo.mainRepoPath, [
      'fetch',
      '-q',
      'origin',
      `+refs/heads/${branchName}:refs/remotes/origin/${branchName}`,
    ]);
    if (!fetchBranch.ok) {
      return {
        ok: false,
        reason: `無法抓取遠端任務分支 ${repo.name}（${repo.key}）origin/${branchName}`,
      };
    }

    const revRes = runGit(repo.mainRepoPath, [
      'rev-parse',
      '--verify',
      '-q',
      `refs/remotes/origin/${branchName}^{commit}`,
    ]);
    const remoteSha = revRes.ok ? revRes.stdout.trim().toLowerCase() : '';
    if (!remoteSha || remoteSha !== commitSha) {
      return {
        ok: false,
        reason: `倉庫「${repo.key}」遠端分支 origin/${branchName} 的 commit（${remoteSha || '無'}）與交件 commit（${commitSha}）不符`,
      };
    }
  }

  return { ok: true };
}

function validateMergePreconditions(
  ctx: TaskContext,
  issueNum: number,
  override: string | null,
): MergePreconditionResult {
  const reject = (reason: string): MergePreconditionResult => {
    console.error(`拒絕合併：${reason}`);
    return { ok: false, code: 3 };
  };

  const target = fetchSingleIssue(ctx, issueNum);
  if (!target) {
    return reject(`找不到 issue #${issueNum}`);
  }
  if (target.state !== 'open') {
    return reject(`issue #${issueNum} 已關閉（目前狀態：${target.state}）`);
  }
  if (!getLabelNames(target).includes('status:fixed')) {
    return reject(`issue #${issueNum} 沒有 status:fixed 標籤`);
  }

  const sortedComments = sortCommentsChronologically(fetchIssueComments(ctx, issueNum));
  const delivery = findLastDelivery(ctx, sortedComments);
  if (!delivery.ok) {
    return reject(delivery.reason);
  }

  const evidenceCheck = findAndValidateEvidence(
    sortedComments,
    delivery.lastDeliverIdx,
    issueNum,
    override,
    delivery.deliveredByKey,
  );
  if (!evidenceCheck.ok) {
    return reject(evidenceCheck.reason);
  }

  if (delivery.noCommit) {
    return { ok: true, noCommit: true, target, deliveredRepos: [] };
  }

  const deliveredRepos: DeliveredRepoItem[] = ctx.repos.flatMap((repo) => {
    const info = delivery.deliveredByKey.get(repo.key);
    return info ? [{ repo, ...info }] : [];
  });

  const remoteCheck = verifyRemoteBranches(deliveredRepos);
  if (!remoteCheck.ok) {
    return reject(remoteCheck.reason);
  }

  return { ok: true, noCommit: false, target, deliveredRepos };
}

function buildMergeMessage(issueNum: number, issueTitle: string, issueRepo: string): string {
  return `合併 #${issueNum}：${issueTitle}\n\nRefs: ${issueRepo}#${issueNum}`;
}

function mergeAndPushSingleRepo(item: DeliveredRepoItem, wtPath: string, mergeMsg: string): SingleRepoMergeResult {
  const { repo, branchName, commitSha } = item;

  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      clearTempWorktree(repo.mainRepoPath, wtPath);

      if (attempt > 0) {
        const refetchMain = runGit(repo.mainRepoPath, [
          'fetch',
          '-q',
          'origin',
          '+refs/heads/main:refs/remotes/origin/main',
        ]);
        if (!refetchMain.ok) {
          fail(
            `合併失敗：重試抓取 ${repo.name} 的 origin/main 失敗：${refetchMain.stderr || refetchMain.stdout || '未知錯誤'}`,
          );
        }
      }

      fs.mkdirSync(path.dirname(wtPath), { recursive: true });
      const wtAdd = runGit(repo.mainRepoPath, ['worktree', 'add', '-q', '--detach', wtPath, ORIGIN_MAIN_REF]);
      if (!wtAdd.ok) {
        fail(`合併失敗：建立 ${repo.name} 暫存工作資料夾失敗：${wtAdd.stderr || wtAdd.stdout || '未知錯誤'}`);
      }

      const mergeRes = runGit(wtPath, ['merge', '--no-ff', '-m', mergeMsg, commitSha]);
      if (!mergeRes.ok) {
        const hasMergeHead = runGit(wtPath, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']).ok;
        const outputText = `${mergeRes.stdout}\n${mergeRes.stderr}`;
        if (hasMergeHead) {
          runGit(wtPath, ['merge', '--abort']);
        }
        if (hasMergeHead || /CONFLICT|衝突/i.test(outputText)) {
          console.error(`合併失敗：${repo.name}（${repo.key}）合併 ${branchName} 到 origin/main 時發生衝突`);
          return { ok: false, code: 3 };
        }
        fail(
          `合併失敗：${repo.name}（${repo.key}）執行 git merge 失敗：${mergeRes.stderr || mergeRes.stdout || '未知錯誤'}`,
        );
      }

      const headRes = runGit(wtPath, ['rev-parse', 'HEAD']);
      if (!headRes.ok) {
        fail(`合併失敗：無法取得 ${repo.name} 的合併 commit SHA：${headRes.stderr || headRes.stdout || '未知錯誤'}`);
      }
      const mergeCommitSha = headRes.stdout.trim();

      const pushRes = runGit(wtPath, ['push', 'origin', 'HEAD:refs/heads/main']);
      if (!pushRes.ok) {
        if (attempt === 0) continue;
        fail(
          `合併失敗：推送 ${repo.name}（${repo.key}）到 origin/main 失敗：${pushRes.stderr || pushRes.stdout || '未知錯誤'}`,
        );
      }

      const verifyFetch = runGit(repo.mainRepoPath, [
        'fetch',
        '-q',
        'origin',
        '+refs/heads/main:refs/remotes/origin/main',
      ]);
      if (!verifyFetch.ok) {
        fail(
          `合併失敗：推送後重新抓取 ${repo.name} 的 origin/main 失敗：${verifyFetch.stderr || verifyFetch.stdout || '未知錯誤'}`,
        );
      }

      const ancestorRes = runGit(repo.mainRepoPath, ['merge-base', '--is-ancestor', commitSha, ORIGIN_MAIN_REF]);
      if (!ancestorRes.ok) {
        fail(`合併失敗：${repo.name}（${repo.key}）的交件 commit ${commitSha} 未成為 origin/main 的祖先`);
      }

      return { ok: true, mergeCommitSha };
    }
  } finally {
    clearTempWorktree(repo.mainRepoPath, wtPath);
  }

  fail(`合併失敗：${repo.name}（${repo.key}）推送到 origin/main 失敗`);
}

function finalizeMergedIssue(
  ctx: TaskContext,
  target: GitHubIssue,
  issueNum: number,
  mergedResults: readonly MergedRepoCommit[],
  override: string | null,
  { noCommit = false }: { noCommit?: boolean } = {},
): void {
  const commentLines = noCommit
    ? ['🤖 Claude', '✅ 驗收通過（零提交），關單。']
    : [
        '🤖 Claude',
        '✅ 驗收通過，已合併 main 並關單。',
        ...mergedResults.map((r) => `- ${r.key}：${r.mergeCommitSha.slice(0, 7)}`),
      ];
  if (override) {
    commentLines.push(`覆核理由：${override}`);
  }
  postIssueComment(ctx, issueNum, commentLines.join('\n'));

  const statusLabels = getLabelNames(target).filter((label) => label.startsWith('status:'));
  for (const label of statusLabels) {
    removeIssueLabel(ctx, issueNum, label);
  }

  runGh([
    'api',
    '-X',
    'PATCH',
    `repos/${ctx.issueRepo}/issues/${issueNum}`,
    '-f',
    'state=closed',
    '-f',
    'state_reason=completed',
  ]);
  console.log(`CLOSED #${issueNum}`);
}

/**
 * 執行 `task merge`：驗證交件與證據包一致後於暫存工作資料夾合併推上 main 並關單。
 */
export function cmdMerge(
  ctx: TaskContext,
  {
    issueNum,
    dryRun = false,
    override = null,
  }: Pick<MergeCommandArgs, 'issueNum'> & { dryRun?: boolean; override?: string | null },
): number {
  const check = validateMergePreconditions(ctx, issueNum, override);
  if (!check.ok) {
    return check.code;
  }

  if (dryRun) {
    if (check.noCommit) {
      console.log(`WOULD_CLOSE #${issueNum}（零提交）`);
    } else {
      for (const item of check.deliveredRepos) {
        console.log(`WOULD_MERGE ${item.repo.key} ${item.branchName} @ ${item.commitSha}`);
      }
    }
    return 0;
  }

  if (check.noCommit) {
    finalizeMergedIssue(ctx, check.target, issueNum, [], override, { noCommit: true });
    return 0;
  }

  const mergeBaseDir = getMergeBaseDir(ctx);
  const issueTitle = String(check.target.title || '').replace(/[\r\n]+/g, ' ').trim();
  const mergeMsg = buildMergeMessage(issueNum, issueTitle, ctx.issueRepo);
  const mergedResults: MergedRepoCommit[] = [];

  for (const item of check.deliveredRepos) {
    const wtPath = resolveSafeChildPath(mergeBaseDir, item.repo.name, '倉庫');
    const mergeRes = mergeAndPushSingleRepo(item, wtPath, mergeMsg);
    if (!mergeRes.ok) {
      return mergeRes.code;
    }
    console.log(`MERGED ${item.repo.key} ${mergeRes.mergeCommitSha}`);
    mergedResults.push({ key: item.repo.key, mergeCommitSha: mergeRes.mergeCommitSha });
  }

  finalizeMergedIssue(ctx, check.target, issueNum, mergedResults, override);
  return 0;
}
