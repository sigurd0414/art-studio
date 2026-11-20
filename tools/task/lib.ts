// @module templates/bin/task/lib
// @role 通用 task 工具的純判斷核心：依專案設定執行影響範圍解析、重疊比對、精準度與三問檢查、開工與退回接手判定、負責對話分類、業務程式行數統計及純文字解析
// @why 將「只做判斷、不碰遠端介面、不改檔、不呼叫外部程序」的邏輯集中為純函式核心，讓命令列工具與測試可安全重用且無副作用
// @forbid 禁止在此模組存取檔案系統、網路、環境變數或執行外部程序，亦不得寫死特定專案特例

import type {
  AnalyzeBusinessLinesOptions,
  BusinessLineAnalysis,
  BusinessLineFileStat,
  CommentRole,
  EvaluateResumeOptions,
  EvaluateResumeResult,
  EvaluateStartFailureCode,
  EvaluateStartOptions,
  EvaluateStartResult,
  GitAheadBehind,
  GitHubComment,
  GitHubIssue,
  GitHubLabel,
  GitNumstatEntry,
  IssueWithLabels,
  MainAutoSyncDecision,
  MainAutoSyncInput,
  MainAutoSyncReasonCode,
  OwnedIssueClassification,
  RepoEntry,
  ScopeEntry,
  ScopeInput,
  ScopeParseResult,
  ScopePrecisionResult,
  ScopePrecisionViolation,
  TaskConfigErrorCode,
  TaskLib,
  ThreeQuestionsResult,
  UnifiedDiffLines,
} from './types.ts';

export const DEFAULT_BUSINESS_LINE_LIMIT = 800;
export const DEFAULT_SOFT_FILE_LINE_LIMIT = 1200;
export const DEFAULT_REWORK_GRACE_MINUTES = 15;

const REPO_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** 設定檔驗證失敗時拋出的具名錯誤。 */
export class TaskConfigError extends Error {
  readonly code: TaskConfigErrorCode;

  constructor(code: TaskConfigErrorCode, message: string) {
    super(message);
    this.name = 'TaskConfigError';
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @why 分頁查詢工具會將多頁 JSON 陣列直接串接輸出（如 `[...][...]`），
 *      需在頂層括號深度歸零處切開各頁再合併，避免誤傷內文含有 `][` 的字串。
 */
export function parsePaginatedJsonArrays(raw: unknown): unknown[] {
  const text = String(raw || '').trim();
  if (!text) return [];
  const results: unknown[] = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = -1;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '[') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === ']') {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        const chunk: unknown = JSON.parse(text.slice(start, i + 1));
        if (Array.isArray(chunk)) results.push(...chunk);
        start = -1;
      }
    }
  }
  return results;
}

function extractLabelNames(labelsOrIssue: readonly GitHubLabel[] | IssueWithLabels | null | undefined): string[] {
  const list: readonly GitHubLabel[] = Array.isArray(labelsOrIssue)
    ? labelsOrIssue
    : labelsOrIssue && typeof labelsOrIssue === 'object' && 'labels' in labelsOrIssue && Array.isArray(labelsOrIssue.labels)
      ? labelsOrIssue.labels
      : [];
  return list
    .map((l) => (typeof l === 'string' ? l : l?.name))
    .filter((name): name is string => Boolean(name));
}

export function getLabelNames(issue: IssueWithLabels | null | undefined): string[] {
  if (!issue || !Array.isArray(issue.labels)) return [];
  return extractLabelNames(issue.labels);
}

function getBodyLines(target: { readonly body?: string | null } | null | undefined): string[] {
  const body = typeof target?.body === 'string' ? target.body : '';
  return body.replace(/\r\n/g, '\n').split('\n');
}

function escapeRegExp(text: string): string {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 從 issue 內文取出指定二級標題底下的內容（直到下一個二級標題為止）。
 * @why 開單常寫「## 標題（附註）」這類帶括號附註的標題，允許全形或半形括號附註可避免漏抓段落。
 */
export function extractSection(body: string | null | undefined, headingName: string): string | null {
  if (typeof body !== 'string' || !body) return null;
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const headingRe = new RegExp(`^##\\s+${escapeRegExp(headingName)}(?:\\s*[（(][^）)]*[）)])?\\s*$`);
  let startIdx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (headingRe.test(lines[i].trim())) {
      startIdx = i + 1;
      break;
    }
  }
  if (startIdx === -1) return null;
  const sectionLines: string[] = [];
  for (let i = startIdx; i < lines.length; i += 1) {
    if (/^##\s+/.test(lines[i].trim())) break;
    sectionLines.push(lines[i]);
  }
  return sectionLines.join('\n');
}

export function parsePrerequisites(body: string | null | undefined): number[] {
  const section = extractSection(body, '要先完成');
  if (section === null) return [];
  const nums: number[] = [];
  for (const m of section.matchAll(/#(\d+)/g)) {
    const n = Number(m[1]);
    if (!nums.includes(n)) nums.push(n);
  }
  return nums;
}

/**
 * @why 單段路徑（不含 `/`）的萬用字元 `*` 可配對同段內任意字元，
 *      透過雙指標動態規劃求兩段 pattern 是否存在共同字串交集。
 */
export function singleSegmentOverlap(segA: string, segB: string): boolean {
  const stride = segB.length + 1;
  const memo = new Map<number, boolean>();
  function dp(i: number, j: number): boolean {
    const key = i * stride + j;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    let res = false;
    if (i === segA.length && j === segB.length) res = true;
    else if (i < segA.length && segA[i] === '*') res = dp(i + 1, j) || (j < segB.length && dp(i, j + 1));
    else if (j < segB.length && segB[j] === '*') res = dp(i, j + 1) || (i < segA.length && dp(i + 1, j));
    else if (i < segA.length && j < segB.length && segA[i] === segB[j]) res = dp(i + 1, j + 1);
    memo.set(key, res);
    return res;
  }
  return dp(0, 0);
}

/**
 * @why 路徑以 `/` 分段後，`**` 可配對零到多段，一般段落則由 `singleSegmentOverlap` 判定單段交集；
 *      不可使用字串前綴比對，以免 `crates/expand/**` 誤判 `crates/expand-extra/x.rs`。
 */
export function segmentListsOverlap(segsA: readonly string[], segsB: readonly string[]): boolean {
  const stride = segsB.length + 1;
  const memo = new Map<number, boolean>();
  function dp(i: number, j: number): boolean {
    const key = i * stride + j;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    let res = false;
    if (i === segsA.length && j === segsB.length) res = true;
    else if (i < segsA.length && segsA[i] === '**') res = dp(i + 1, j) || (j < segsB.length && dp(i, j + 1));
    else if (j < segsB.length && segsB[j] === '**') res = dp(i, j + 1) || (i < segsA.length && dp(i + 1, j));
    else if (i < segsA.length && j < segsB.length) {
      res = singleSegmentOverlap(segsA[i], segsB[j]) && dp(i + 1, j + 1);
    }
    memo.set(key, res);
    return res;
  }
  return dp(0, 0);
}

export function expandPathPattern(pattern: string): string[][] {
  const raw = String(pattern || '');
  const segs = raw.split('/').filter(Boolean);
  return raw.includes('*') ? [segs] : [segs, [...segs, '**']];
}

function singleSegmentSubset(sub: string, sup: string): boolean {
  const stride = sup.length + 1;
  const memo = new Map<number, boolean>();
  function dp(i: number, j: number): boolean {
    const key = i * stride + j;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    let res = false;
    if (i === sub.length && j === sup.length) res = true;
    else if (i === sub.length) res = sup[j] === '*' && dp(i, j + 1);
    else if (j === sup.length) res = false;
    else if (sup[j] === '*') res = dp(i, j + 1) || dp(i + 1, j);
    else if (sub[i] === '*') res = false;
    else if (sub[i] === sup[j]) res = dp(i + 1, j + 1);
    memo.set(key, res);
    return res;
  }
  return dp(0, 0);
}

function segmentListsSubset(subSegs: readonly string[], supSegs: readonly string[]): boolean {
  const stride = supSegs.length + 1;
  const memo = new Map<number, boolean>();
  function dp(i: number, j: number): boolean {
    const key = i * stride + j;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    let res = false;
    if (i === subSegs.length && j === supSegs.length) res = true;
    else if (i === subSegs.length) res = supSegs[j] === '**' && dp(i, j + 1);
    else if (j === supSegs.length) res = false;
    else if (supSegs[j] === '**') res = dp(i, j + 1) || dp(i + 1, j);
    else if (subSegs[i] === '**') {
      // @why 來源端的 `**` 可能展開為 0 段或多段，只有目標端以 `*` 逐段吸收且後續仍可涵蓋時才成立
      res = dp(i + 1, j) && supSegs[j] === '*' && dp(i, j + 1);
    } else {
      res = singleSegmentSubset(subSegs[i], supSegs[j]) && dp(i + 1, j + 1);
    }
    memo.set(key, res);
    return res;
  }
  return dp(0, 0);
}

function normalizeRepoRelPath(filePath: string): string {
  return String(filePath || '')
    .replace(/\\/g, '/')
    .replace(/^(?:\.\/|\/)+/, '')
    .replace(/\/+$/, '');
}

function stripPatternSlashes(pattern: string): string {
  return String(pattern || '').trim().replace(/^\/+|\/+$/g, '');
}

function fileMatchesPattern(filePath: string, pattern: string): boolean {
  const fileSegs = normalizeRepoRelPath(filePath).split('/').filter(Boolean);
  if (fileSegs.length === 0) return false;
  return expandPathPattern(stripPatternSlashes(pattern)).some((patSegs) =>
    segmentListsOverlap(fileSegs, patSegs),
  );
}

/** 解析 `git diff --numstat -M -z` 的輸出（支援一般變更與搬移／更名紀錄）。 */
export function parseGitNumstatZ(raw: string | null | undefined): GitNumstatEntry[] {
  const text = String(raw || '');
  if (!text) return [];
  const parts = text.split('\0');
  const entries: GitNumstatEntry[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    const rec = parts[i];
    if (!rec) continue;
    const tab1 = rec.indexOf('\t');
    const tab2 = tab1 === -1 ? -1 : rec.indexOf('\t', tab1 + 1);
    if (tab1 === -1 || tab2 === -1) continue;
    const addedRaw = rec.slice(0, tab1);
    const deletedRaw = rec.slice(tab1 + 1, tab2);
    const pathPart = rec.slice(tab2 + 1);
    let oldPath: string | null = null;
    let filePath = pathPart;
    if (pathPart === '') {
      oldPath = normalizeRepoRelPath(parts[++i] || '');
      filePath = normalizeRepoRelPath(parts[++i] || '');
    } else {
      filePath = normalizeRepoRelPath(filePath);
    }
    if (!filePath) continue;
    const binary = addedRaw === '-' || deletedRaw === '-';
    entries.push({
      path: filePath,
      oldPath,
      added: binary ? 0 : Number(addedRaw) || 0,
      deleted: binary ? 0 : Number(deletedRaw) || 0,
      binary,
    });
  }
  return entries;
}

/** 解析 `git -c core.quotepath=false diff -M -U0 --no-color` 的增刪行，用於扣除同分支內從 A 檔搬到 B 檔的純搬移相同行。 */
export function parseUnifiedDiffU0Lines(diffText: string | null | undefined): UnifiedDiffLines {
  const addedByFile = new Map<string, string[]>();
  const deletedByFile = new Map<string, string[]>();
  let oldFile: string | null = null;
  let newFile: string | null = null;
  let inHunk = false;

  const pushLine = (map: Map<string, string[]>, file: string, line: string): void => {
    let list = map.get(file);
    if (!list) {
      list = [];
      map.set(file, list);
    }
    list.push(line);
  };

  for (const line of String(diffText || '').split(/\r?\n/)) {
    if (line.startsWith('diff --git ')) {
      oldFile = null;
      newFile = null;
      inHunk = false;
      continue;
    }
    if (!inHunk) {
      if (line.startsWith('--- ')) {
        const target = line.slice(4).trim();
        oldFile = target === '/dev/null' ? null : normalizeRepoRelPath(target.startsWith('a/') ? target.slice(2) : target);
      } else if (line.startsWith('+++ ')) {
        const target = line.slice(4).trim();
        newFile = target === '/dev/null' ? null : normalizeRepoRelPath(target.startsWith('b/') ? target.slice(2) : target);
      } else if (line.startsWith('@@ ')) {
        inHunk = true;
      }
      continue;
    }
    if (line.startsWith('@@ ')) continue;
    if (line.startsWith('+') && newFile) pushLine(addedByFile, newFile, line.slice(1));
    else if (line.startsWith('-') && oldFile) pushLine(deletedByFile, oldFile, line.slice(1));
  }

  return { addedByFile, deletedByFile };
}

export function countTextFileLines(content: string | null | undefined): number {
  if (typeof content !== 'string' || content.length === 0) return 0;
  return content.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n').length;
}

export function parseGitAheadBehind(raw: string | null | undefined): GitAheadBehind | null {
  const m = /^(\d+)\s+(\d+)$/.exec(String(raw || '').trim());
  return m ? { ahead: Number(m[1]), behind: Number(m[2]) } : null;
}

/** 從對話連結或代號取出 `session_…` 代號（找不到就原樣去頭尾空白）。 */
export function normalizeSessionId(raw: string | null | undefined): string {
  const s = String(raw || '').trim();
  const m = /session_[A-Za-z0-9]+/.exec(s);
  return m ? m[0] : s;
}

/**
 * 依讀取到的 git 狀態判定自動同步開頭該快轉主資料夾還是跳過並印出提醒。
 * @why 保持純判定職責：只依傳入的狀態資料回傳決策，不直接執行任何 git 變更指令。
 */
export function evaluateMainAutoSync({
  exists = true,
  isGitRepo = true,
  hasOrigin = true,
  branch = '',
  statusOk = true,
  porcelain = '',
  fetchOk = true,
  fetchError = '',
  hasOriginMain = true,
  aheadCount = 0,
  behindCount = 0,
}: MainAutoSyncInput = {}): MainAutoSyncDecision {
  const skip = (reasonCode: MainAutoSyncReasonCode, message: string, behind = 0): MainAutoSyncDecision => ({
    action: 'skip',
    reasonCode,
    shouldNotify: true,
    behindCount: behind,
    message,
  });
  const noop = (reasonCode: MainAutoSyncReasonCode): MainAutoSyncDecision => ({
    action: 'noop',
    reasonCode,
    shouldNotify: false,
    behindCount: 0,
    message: null,
  });

  if (!exists || !isGitRepo) return skip('not-git-repo', '提醒：主資料夾不是有效的 Git 倉庫，未自動更新。');
  if (!statusOk) return skip('status-error', '提醒：無法檢查主資料夾工作區狀態，未自動更新。');

  const safeBehind = Number.isInteger(behindCount) && behindCount > 0 ? behindCount : 0;
  const safeAhead = Number.isInteger(aheadCount) && aheadCount > 0 ? aheadCount : 0;

  if (branch !== 'main') {
    const branchLabel = branch === 'HEAD' || !branch ? 'detached HEAD' : branch;
    const reason = `目前在 ${branchLabel} 分支（非 main）`;
    const msg = safeBehind > 0
      ? `主資料夾落後 origin/main ${safeBehind} 個提交，未自動更新：${reason}`
      : `提醒：主資料夾${reason}，未自動更新。`;
    return skip('not-main', msg, safeBehind);
  }
  if (String(porcelain || '').trim().length > 0) {
    const reason = '有未提交的改動';
    const msg = safeBehind > 0
      ? `主資料夾落後 origin/main ${safeBehind} 個提交，未自動更新：${reason}`
      : `提醒：主資料夾${reason}，未自動更新。`;
    return skip('dirty', msg, safeBehind);
  }
  if (!hasOrigin) return noop('no-origin');
  if (!fetchOk) {
    const err = String(fetchError || '未知錯誤').trim().split('\n')[0];
    return skip('fetch-failed', `提醒：主資料夾抓取 origin/main 失敗，未自動更新：${err}`, safeBehind);
  }
  if (!hasOriginMain) return noop('no-origin-main');
  if (safeBehind > 0 && safeAhead > 0) {
    return skip(
      'cannot-ff',
      `主資料夾落後 origin/main ${safeBehind} 個提交（且本機多出 ${safeAhead} 個提交），未自動更新：無法快轉`,
      safeBehind,
    );
  }
  if (safeBehind > 0) {
    return { action: 'pull', reasonCode: 'behind', shouldNotify: true, behindCount: safeBehind, message: null };
  }
  return noop('up-to-date');
}

function sortCommentsByTime(comments: readonly GitHubComment[] | null | undefined): GitHubComment[] {
  return (Array.isArray(comments) ? comments : [])
    .filter((c): c is GitHubComment => Boolean(c && typeof c === 'object'))
    .slice()
    .sort((a, b) => (Date.parse(a.created_at || '') || 0) - (Date.parse(b.created_at || '') || 0));
}

function commentRole(comment: GitHubComment | null | undefined): CommentRole {
  const firstLine = getBodyLines(comment)[0].trimStart();
  if (firstLine.startsWith('🤖 Claude')) return 'planner';
  if (firstLine.startsWith('🧪 驗收員')) return 'verifier';
  if (/^🛠️\s+\S/.test(firstLine)) return 'implementer';
  return 'user';
}

function isImplementerNoticeComment(comment: GitHubComment): boolean {
  if (commentRole(comment) !== 'implementer') return false;
  return getBodyLines(comment).some((line) => line.trimStart().startsWith('🔁'));
}

function findLatestDispatchComment(comments: readonly GitHubComment[] | null | undefined): GitHubComment | null {
  if (!Array.isArray(comments)) return null;
  const dispatches = sortCommentsByTime(comments).filter((c) => {
    if (commentRole(c) !== 'planner') return false;
    const lines = getBodyLines(c);
    return lines.length >= 2 && lines[1].trimStart().startsWith('📮 派工');
  });
  return dispatches.length > 0 ? dispatches[dispatches.length - 1] : null;
}

function isIssueOwnedBySession(issue: GitHubIssue | null | undefined, sessionId: string): boolean {
  const id = normalizeSessionId(sessionId);
  if (!id) return false;
  const firstLine = getBodyLines(issue)[0] || '';
  return firstLine.includes('負責對話') && firstLine.includes(id);
}

/**
 * 判斷一張由本對話負責的開啟中任務目前需不需要處理，並回傳建議動作。
 * @why 即使任務是由其他對話代開，只要第一行負責對話指派給本對話就應納入巡檢；
 *      判斷最新一則留言時略過實作者接手通知與驗收員證據包，避免誤判或掩蓋待回覆問題。
 */
function classifyOwnedIssue(
  issue: GitHubIssue | null | undefined,
  comments: readonly GitHubComment[] | null | undefined,
): OwnedIssueClassification {
  const labels = getLabelNames(issue);
  const sorted = sortCommentsByTime(comments);
  const plannerComments = sorted.filter((c) => commentRole(c) === 'planner');
  const meaningful = sorted.filter((c) => !isImplementerNoticeComment(c) && commentRole(c) !== 'verifier');
  const last = meaningful[meaningful.length - 1] || null;
  if (labels.includes('status:fixed')) return { action: '驗收', reason: '已標 status:fixed，等你驗收' };
  if (last && commentRole(last) === 'implementer') {
    return { action: '回覆', reason: '最新一則是實作者留言（提問或回報），等你回覆' };
  }
  if (plannerComments.length === 0) {
    return { action: '認領', reason: '還沒有任何規劃者留言：可能是別的對話開給你的新單' };
  }
  if (labels.includes('status:needs-acceptance')) {
    return { action: '寫驗收', reason: '還在 status:needs-acceptance，要寫驗收條件或派工' };
  }
  return { action: null, reason: '' };
}

function parseBusinessLineLimitValue(body: string | null | undefined, defaultLimit: number): number {
  if (typeof body !== 'string' || !body) return defaultLimit;
  for (const rawLine of body.replace(/\r\n/g, '\n').split('\n')) {
    const line = rawLine
      .trim()
      .replace(/^(?:[-*•]\s+)/, '')
      .replace(/^\*\*|\*\*$/g, '')
      .replace(/^`|`$/g, '')
      .trim();
    const m = /^業務程式上限(?:\*\*)?\s*[:：]\s*(\d[\d,]*)\s*行?(?:（[^）]*）|\([^)]*\))?$/.exec(line);
    if (!m) continue;
    const parsed = Number(m[1].replace(/,/g, ''));
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
  }
  return defaultLimit;
}

function getIssueFromLookup(
  issuesLookup: Map<number, GitHubIssue> | readonly GitHubIssue[] | null | undefined,
  issueNum: number,
): GitHubIssue | null {
  if (!issuesLookup) return null;
  if (issuesLookup instanceof Map) return issuesLookup.get(issueNum) || null;
  if (Array.isArray(issuesLookup)) return issuesLookup.find((it) => it && it.number === issueNum) || null;
  return null;
}

function parseRepoScopedEntries(
  rawList: unknown,
  repoMap: Map<string, RepoEntry>,
  fieldName: string,
): ScopeEntry[] {
  if (rawList === undefined || rawList === null) return [];
  if (!Array.isArray(rawList)) throw new TaskConfigError('bad-entry', `${fieldName} 必須是陣列`);
  const entries: ScopeEntry[] = [];
  for (const rawItem of rawList) {
    if (typeof rawItem !== 'string') throw new TaskConfigError('bad-entry', `${fieldName} 項目必須是字串`);
    const trimmed = rawItem.trim();
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) {
      throw new TaskConfigError('bad-entry', `${fieldName} 項目缺少倉庫代號前綴（<key>:<路徑>）：${rawItem}`);
    }
    const repo = trimmed.slice(0, colonIdx).trim();
    const pattern = stripPatternSlashes(trimmed.slice(colonIdx + 1));
    if (!repoMap.has(repo)) throw new TaskConfigError('bad-entry', `${fieldName} 含未知倉庫代號「${repo}」：${rawItem}`);
    if (!pattern) throw new TaskConfigError('bad-entry', `${fieldName} 項目路徑樣式為空：${rawItem}`);
    entries.push({ raw: `${repo}:${pattern}`, repo, pattern });
  }
  return entries;
}

function parsePlainPathPatterns(rawList: unknown, fieldName: string): string[] {
  if (rawList === undefined || rawList === null) return [];
  if (!Array.isArray(rawList)) throw new TaskConfigError('bad-entry', `${fieldName} 必須是陣列`);
  const patterns: string[] = [];
  for (const rawItem of rawList) {
    if (typeof rawItem !== 'string') throw new TaskConfigError('bad-entry', `${fieldName} 項目必須是字串`);
    const pattern = stripPatternSlashes(rawItem);
    if (!pattern) throw new TaskConfigError('bad-entry', `${fieldName} 項目路徑樣式為空`);
    patterns.push(pattern);
  }
  return patterns;
}

function normalizeContainerDirs(rawDirs: unknown): string[] {
  if (!Array.isArray(rawDirs)) return [];
  return rawDirs.map((d) => stripPatternSlashes(typeof d === 'string' ? d : '')).filter(Boolean);
}

interface ParsedConfigInternal {
  repos: RepoEntry[];
  defaultRepo: string | null;
  repoMap: Map<string, RepoEntry>;
  containerDirsByRepo: Map<string, string[]>;
  sharedGeneratedEntries: ScopeEntry[];
  evidenceEntries: ScopeEntry[];
  threeQuestionsEntries: ScopeEntry[];
  generatedPatterns: string[];
  businessLineLimit: number;
  softFileLineLimit: number;
  reworkGraceMs: number;
}

function validateAndParseConfig(config: unknown): ParsedConfigInternal {
  if (!isRecord(config) || !Array.isArray(config.repos) || config.repos.length === 0) {
    throw new TaskConfigError('no-repos', '設定檔缺少至少一個倉庫（repos）');
  }

  const defaultContainerDirs = normalizeContainerDirs(config.containerDirs);
  const repos: RepoEntry[] = [];
  const repoMap = new Map<string, RepoEntry>();
  const containerDirsByRepo = new Map<string, string[]>();

  for (const item of config.repos) {
    if (!isRecord(item)) throw new TaskConfigError('bad-repo-key', '倉庫項目必須為物件');
    const name = typeof item.name === 'string' ? item.name : '';
    const key = item.key !== undefined && item.key !== null ? String(item.key) : name;
    if (!REPO_KEY_RE.test(key)) throw new TaskConfigError('bad-repo-key', `倉庫代號「${key}」格式不合法`);
    if (repoMap.has(key)) throw new TaskConfigError('duplicate-repo-key', `倉庫代號「${key}」重複`);
    const path = typeof item.path === 'string' && item.path.trim() ? item.path : '.';
    const repoObj: RepoEntry = { key, name: name || key, path };
    repos.push(repoObj);
    repoMap.set(key, repoObj);
    containerDirsByRepo.set(
      key,
      Array.isArray(item.containerDirs) ? normalizeContainerDirs(item.containerDirs) : defaultContainerDirs,
    );
  }

  const businessLineLimit =
    typeof config.businessLineLimit === 'number' &&
    Number.isSafeInteger(config.businessLineLimit) &&
    config.businessLineLimit > 0
      ? config.businessLineLimit
      : DEFAULT_BUSINESS_LINE_LIMIT;
  const fileLineLimits = isRecord(config.fileLineLimits) ? config.fileLineLimits : null;
  const softLimitVal = fileLineLimits?.soft;
  const softFileLineLimit =
    typeof softLimitVal === 'number' && Number.isSafeInteger(softLimitVal) && softLimitVal > 0
      ? softLimitVal
      : DEFAULT_SOFT_FILE_LINE_LIMIT;
  const reworkGraceMinutes =
    typeof config.reworkGraceMinutes === 'number' &&
    Number.isFinite(config.reworkGraceMinutes) &&
    config.reworkGraceMinutes >= 0
      ? config.reworkGraceMinutes
      : DEFAULT_REWORK_GRACE_MINUTES;

  return {
    repos,
    defaultRepo: repos.length === 1 ? repos[0].key : null,
    repoMap,
    containerDirsByRepo,
    sharedGeneratedEntries: parseRepoScopedEntries(config.sharedGenerated, repoMap, 'sharedGenerated'),
    evidenceEntries: parseRepoScopedEntries(config.evidencePaths, repoMap, 'evidencePaths'),
    threeQuestionsEntries: parseRepoScopedEntries(config.threeQuestionsPaths, repoMap, 'threeQuestionsPaths'),
    generatedPatterns: [
      ...parsePlainPathPatterns(config.generatedPaths, 'generatedPaths'),
      ...parsePlainPathPatterns(config.lineCountExclude, 'lineCountExclude'),
    ],
    businessLineLimit,
    softFileLineLimit,
    reworkGraceMs: reworkGraceMinutes * 60 * 1000,
  };
}

type ResolveScopeLineResult =
  | { ok: true; entry: ScopeEntry }
  | { ok: false; emptyPattern: boolean; invalidRepo: string | null };

/** 統一解析單筆範圍文字，支援多倉庫 `<key>:<樣式>` 與單倉庫省略前綴的寫法。 */
function resolveScopeLine(
  line: string,
  repoMap: Map<string, RepoEntry>,
  defaultRepo: string | null,
): ResolveScopeLineResult {
  const colonIdx = line.indexOf(':');
  if (colonIdx !== -1) {
    const prefix = line.slice(0, colonIdx).trim();
    if (repoMap.has(prefix)) {
      const pattern = stripPatternSlashes(line.slice(colonIdx + 1));
      if (!pattern) return { ok: false, emptyPattern: true, invalidRepo: line };
      return { ok: true, entry: { raw: `${prefix}:${pattern}`, repo: prefix, pattern } };
    }
  }
  if (defaultRepo !== null) {
    const pattern = stripPatternSlashes(line);
    if (!pattern) return { ok: false, emptyPattern: true, invalidRepo: null };
    return { ok: true, entry: { raw: `${defaultRepo}:${pattern}`, repo: defaultRepo, pattern } };
  }
  const invalidRepo = (colonIdx === -1 ? line : line.slice(0, colonIdx).trim()) || line;
  return { ok: false, emptyPattern: false, invalidRepo };
}

/** 依專案設定建立通用 task 工具判斷核心。 */
export function createTaskLib(config: unknown): TaskLib {
  const cfg = validateAndParseConfig(config);
  const {
    repos,
    defaultRepo,
    repoMap,
    containerDirsByRepo,
    sharedGeneratedEntries,
    evidenceEntries,
    threeQuestionsEntries,
    generatedPatterns,
    businessLineLimit,
    softFileLineLimit,
    reworkGraceMs,
  } = cfg;

  /**
   * @why 共用自動產生檔常由工具在多張單同步更新，若算進重疊或要求逐單列範圍會讓平行作業彼此卡死；
   *      只有被共用自動產生樣式完整涵蓋的項目才略過，避免過度寬鬆的萬用字元被誤放行。
   */
  function isSharedGeneratedScopeEntry(entry: ScopeEntry | null | undefined): boolean {
    if (!entry || !entry.repo || !entry.pattern || sharedGeneratedEntries.length === 0) return false;
    const entrySegs = stripPatternSlashes(entry.pattern).split('/').filter(Boolean);
    if (entrySegs.length === 0) return false;
    return sharedGeneratedEntries.some(
      (target) =>
        target.repo === entry.repo &&
        expandPathPattern(target.pattern).some((targetSegs) => segmentListsSubset(entrySegs, targetSegs)),
    );
  }

  /** @why 驗收證據包會寫在任務分支中但不是業務改動，不要求寫進影響範圍；因此只於範圍外檔案比對時略過。 */
  function isSkippedChangedFile(fileEntry: ScopeEntry | null | undefined): boolean {
    if (!fileEntry || !fileEntry.repo || !fileEntry.pattern) return false;
    return (
      sharedGeneratedEntries.some((target) => fileMatchesScopeEntry(fileEntry, target)) ||
      evidenceEntries.some((target) => fileMatchesScopeEntry(fileEntry, target))
    );
  }

  function parseScopeSection(body: string | null | undefined): ScopeParseResult {
    const section = extractSection(body, '影響範圍');
    if (section === null) return { hasSection: false, entries: [], invalidRepo: null };
    const fenceMatches = [...section.matchAll(/```[^\n]*\n([\s\S]*?)```/g)];
    const rawLines = fenceMatches.length > 0 ? fenceMatches.flatMap((m) => m[1].split('\n')) : section.split('\n');
    const entries: ScopeEntry[] = [];
    for (const rawLine of rawLines) {
      const line = rawLine.trim().replace(/^[-*]\s+/, '').replace(/^`|`$/g, '').trim();
      if (!line || line.startsWith('```')) continue;
      const parsed = resolveScopeLine(line, repoMap, defaultRepo);
      if (parsed.ok) entries.push(parsed.entry);
      else if (parsed.invalidRepo) return { hasSection: true, entries, invalidRepo: parsed.invalidRepo };
    }
    return { hasSection: true, entries, invalidRepo: null };
  }

  function scopeEntriesOverlap(entryA: ScopeEntry | null | undefined, entryB: ScopeEntry | null | undefined): boolean {
    if (!entryA || !entryB) return false;
    if (isSharedGeneratedScopeEntry(entryA) || isSharedGeneratedScopeEntry(entryB)) return false;
    if (entryA.repo !== entryB.repo) return false;
    const variantsA = expandPathPattern(stripPatternSlashes(entryA.pattern));
    const variantsB = expandPathPattern(stripPatternSlashes(entryB.pattern));
    return variantsA.some((segsA) => variantsB.some((segsB) => segmentListsOverlap(segsA, segsB)));
  }

  function fileMatchesScopeEntry(
    fileEntry: ScopeEntry | null | undefined,
    scopeEntry: ScopeEntry | null | undefined,
  ): boolean {
    if (!fileEntry || !scopeEntry || fileEntry.repo !== scopeEntry.repo) return false;
    const fileSegs = stripPatternSlashes(fileEntry.pattern).split('/').filter(Boolean);
    return expandPathPattern(stripPatternSlashes(scopeEntry.pattern)).some((scopeSegs) =>
      segmentListsOverlap(fileSegs, scopeSegs),
    );
  }

  function findOutOfScopeFiles<T extends ScopeEntry>(
    changedFiles: readonly T[] | null | undefined,
    scopeEntries: ScopeInput,
  ): T[] {
    const files = Array.isArray(changedFiles) ? changedFiles : [];
    const entries = normalizeScopeEntries(scopeEntries);
    return files.filter(
      (fileEntry) =>
        fileEntry &&
        fileEntry.repo &&
        fileEntry.pattern &&
        !isSkippedChangedFile(fileEntry) &&
        !entries.some((scopeEntry) => fileMatchesScopeEntry(fileEntry, scopeEntry)),
    );
  }

  function normalizeScopeEntries(scope: ScopeInput): ScopeEntry[] {
    const rawList: readonly (string | ScopeEntry)[] = Array.isArray(scope)
      ? scope
      : scope && typeof scope === 'object' && 'entries' in scope && Array.isArray(scope.entries)
        ? scope.entries
        : [];
    const entries: ScopeEntry[] = [];
    for (const item of rawList) {
      if (typeof item === 'string') {
        const parsed = resolveScopeLine(item.trim(), repoMap, defaultRepo);
        if (parsed.ok) entries.push(parsed.entry);
      } else if (item && typeof item === 'object' && item.repo && item.pattern) {
        const pattern = stripPatternSlashes(item.pattern);
        if (pattern) entries.push({ raw: item.raw || `${item.repo}:${pattern}`, repo: item.repo, pattern });
      }
    }
    return entries;
  }

  /** @why 扣除「只用來裝東西、本身不代表模組」的容器前綴後，`**` 或 `*` 前至少還要有一層固定資料夾，避免一次鎖住整個容器或倉庫。 */
  function stripLongestContainerPrefix(
    repo: string,
    segs: readonly string[],
  ): { matchedPrefix: string | null; remaining: string[] } {
    const prefixes = containerDirsByRepo.get(repo) || [];
    let bestLen = 0;
    let matchedPrefix: string | null = null;
    for (const prefix of prefixes) {
      const prefixSegs = prefix.split('/').filter(Boolean);
      if (prefixSegs.length <= bestLen || segs.length < prefixSegs.length) continue;
      if (prefixSegs.every((p, idx) => segs[idx] === p)) {
        bestLen = prefixSegs.length;
        matchedPrefix = prefix;
      }
    }
    return { matchedPrefix, remaining: segs.slice(bestLen) };
  }

  function checkScopePrecision(
    scope: ScopeInput,
    labels: readonly GitHubLabel[] = [],
    body: string | null = '',
  ): ScopePrecisionResult {
    if (extractLabelNames(labels).includes('scope:broad')) {
      const whySection = extractSection(body, '為什麼要大範圍');
      if (whySection === null || !whySection.trim()) {
        return {
          ok: false,
          reasonCode: 'broad-scope',
          violations: [],
          reason: '影響範圍太寬（已標記 scope:broad，但內文缺少「## 為什麼要大範圍」段落或內容為空）',
        };
      }
      return { ok: true, violations: [] };
    }

    const violations: ScopePrecisionViolation[] = [];
    for (const entry of normalizeScopeEntries(scope)) {
      if (isSharedGeneratedScopeEntry(entry)) continue;
      const segs = entry.pattern.split('/').filter(Boolean);
      const testsIdx = segs.indexOf('tests');
      if (testsIdx !== -1) {
        if (segs.includes('**') || entry.pattern.includes('**')) {
          violations.push({ raw: entry.raw, reason: '測試資料夾底下不可出現 `**`，請寫到具體檔名' });
          continue;
        }
        if (segs.length <= testsIdx + 1) {
          violations.push({ raw: entry.raw, reason: '測試路徑結尾不能只寫到資料夾，請寫到具體檔名' });
          continue;
        }
        const lastSeg = segs[segs.length - 1];
        if (lastSeg.includes('*') || !/\.[^./]+$/.test(lastSeg)) {
          violations.push({ raw: entry.raw, reason: '測試路徑必須寫到具體檔名（例如 example.test.mjs 或 test_name.rs）' });
          continue;
        }
      }

      const firstWildcardIdx = segs.findIndex((s) => s.includes('*'));
      if (firstWildcardIdx !== -1) {
        const { matchedPrefix, remaining } = stripLongestContainerPrefix(entry.repo, segs.slice(0, firstWildcardIdx));
        if (remaining.length < 1) {
          violations.push({
            raw: entry.raw,
            reason: matchedPrefix
              ? `萬用字元前扣掉容器資料夾「${matchedPrefix}」後沒有剩餘層數，至少需再指定一層資料夾或具體檔案`
              : '萬用字元前至少需有一層有效模組資料夾（不可直接寫在倉庫根目錄）',
          });
        }
      } else {
        const { matchedPrefix, remaining } = stripLongestContainerPrefix(entry.repo, segs);
        if (matchedPrefix && remaining.length === 0) {
          violations.push({ raw: entry.raw, reason: `不能只寫容器資料夾「${matchedPrefix}」，請寫到具體子資料夾或檔案` });
        }
      }
    }

    if (violations.length > 0) {
      const summary = violations.map((v) => `${v.raw}：${v.reason}`).join('；');
      return { ok: false, reasonCode: 'broad-scope', violations, reason: `影響範圍太寬（${summary}）` };
    }
    return { ok: true, violations: [] };
  }

  /**
   * 判斷任務是否屬於「會新增能力的單」（`type:feature` 且影響範圍落在設定的觸發路徑）。
   * @why 沿用 `scopeEntriesOverlap` 做路徑重疊判定，避免重寫第二套萬用字元比對。
   */
  function requiresThreeQuestionsCheck(scope: ScopeInput, labels: readonly GitHubLabel[] = []): boolean {
    if (threeQuestionsEntries.length === 0) return false;
    if (!extractLabelNames(labels).includes('type:feature')) return false;
    return normalizeScopeEntries(scope).some((entry) =>
      threeQuestionsEntries.some((target) => scopeEntriesOverlap(entry, target)),
    );
  }

  function checkThreeQuestions(
    scope: ScopeInput,
    labels: readonly GitHubLabel[] = [],
    body: string | null = '',
  ): ThreeQuestionsResult {
    if (!requiresThreeQuestionsCheck(scope, labels)) return { ok: true, required: false, count: 0 };
    const section = extractSection(body, '三問');
    if (section === null) {
      return {
        ok: false,
        required: true,
        reasonCode: 'missing-three-questions',
        count: 0,
        reason: '新增能力的任務（type:feature 且影響範圍涵蓋設定的三問觸發路徑）缺少「## 三問」段落',
      };
    }
    const items = section.split('\n').map((l) => l.trim()).filter((l) => /^\d+\./.test(l));
    if (items.length < 3) {
      return {
        ok: false,
        required: true,
        reasonCode: 'incomplete-three-questions',
        count: items.length,
        reason: `「## 三問」段落裡 1.、2.、3. 開頭的項目少於 3 個（目前僅 ${items.length} 個）`,
      };
    }
    return { ok: true, required: true, count: items.length };
  }

  function evaluateIssueCanStart(
    target: GitHubIssue | null | undefined,
    {
      issueNum = target?.number,
      issuesLookup = null,
      activeIssues = [],
      comments = null,
      requireDispatch = false,
      requireScope = true,
    }: EvaluateStartOptions = {},
  ): EvaluateStartResult {
    const fail = (
      reasonCode: EvaluateStartFailureCode,
      reason: string,
      extra: Omit<Extract<EvaluateStartResult, { ok: false }>, 'ok' | 'reasonCode' | 'reason'> = {},
    ): EvaluateStartResult => ({ ok: false, reasonCode, ...extra, reason });
    if (!target) return fail('not-found', `找不到 issue #${issueNum}`);
    if (target.state !== 'open') return fail('closed', `issue #${target.number} 已關閉`);
    const labels = getLabelNames(target);
    if (!labels.includes('status:ready')) return fail('not-ready', `issue #${target.number} 沒有 status:ready 標籤`);

    let dispatchComment: GitHubComment | null = null;
    if (requireDispatch) {
      dispatchComment = findLatestDispatchComment(comments);
      if (!dispatchComment) return fail('no-dispatch', `issue #${target.number} 尚無規劃者派工留言`);
    }

    const scope = parseScopeSection(target.body);
    if (requireScope && (!scope.hasSection || scope.entries.length === 0)) {
      return scope.invalidRepo
        ? fail('invalid-scope', `issue #${target.number} 影響範圍包含不認得的倉庫代號或格式錯誤（${scope.invalidRepo}）`)
        : fail('missing-scope', `issue #${target.number} 缺少「影響範圍」段落或內容為空`);
    }
    if (scope.invalidRepo) {
      return fail('invalid-scope', `issue #${target.number} 影響範圍包含不認得的倉庫代號（${scope.invalidRepo}）`);
    }

    if (scope.entries.length > 0 || labels.includes('scope:broad')) {
      const precision = checkScopePrecision(scope, labels, target.body ?? '');
      if (!precision.ok) return fail(precision.reasonCode, precision.reason, { violations: precision.violations });
    }

    const threeQuestions = checkThreeQuestions(scope, labels, target.body ?? '');
    if (!threeQuestions.ok) return fail(threeQuestions.reasonCode, threeQuestions.reason, { threeQuestions });

    const prereqNums = parsePrerequisites(target.body);
    for (const preNum of prereqNums) {
      const preIssue = getIssueFromLookup(issuesLookup, preNum);
      if (!preIssue || preIssue.state !== 'closed') {
        return fail('prereq-open', `前置 #${preNum} 未關閉`, { prereqNum: preNum });
      }
    }

    for (const other of Array.isArray(activeIssues) ? activeIssues : []) {
      if (!other || other.number === target.number || other.state !== 'open') continue;
      const otherLabels = getLabelNames(other);
      if (!otherLabels.includes('status:in-progress') && !otherLabels.includes('status:rework')) continue;
      const otherScope = parseScopeSection(other.body);
      for (const myEntry of scope.entries) {
        for (const otherEntry of otherScope.entries) {
          if (scopeEntriesOverlap(myEntry, otherEntry)) {
            return fail(
              'scope-overlap',
              `影響範圍與 #${other.number} 的「${otherEntry.raw}」重疊（本任務為「${myEntry.raw}」）`,
              { conflictIssueNum: other.number },
            );
          }
        }
      }
    }

    return { ok: true, scope, prereqNums, dispatchComment, threeQuestions };
  }

  /**
   * 判斷一張 `status:rework` 的單能不能由新對話接手重修。
   * @why 實作對話交件後便收工，退回單若只靠原對話主動回來容易無人接手；
   *      因此以「非通知的實作者發言」之後是否存在規劃者或使用者退回說明為準，並保留寬限時間給原對話。
   */
  function evaluateIssueCanResume(
    target: GitHubIssue | null | undefined,
    { comments = [], nowMs = Date.now(), graceMs = reworkGraceMs }: EvaluateResumeOptions = {},
  ): EvaluateResumeResult {
    if (!target) return { ok: false, reasonCode: 'not-found', reason: '找不到 issue' };
    if (target.state !== 'open') return { ok: false, reasonCode: 'closed', reason: `issue #${target.number} 已關閉` };
    if (!getLabelNames(target).includes('status:rework')) {
      return {
        ok: false,
        reasonCode: 'not-rework',
        reason: `issue #${target.number} 沒有 status:rework 標籤（可能已有對話接手）`,
      };
    }

    const sorted = sortCommentsByTime(comments);
    let lastImplIdx = -1;
    sorted.forEach((c, idx) => {
      if (commentRole(c) === 'implementer' && !isImplementerNoticeComment(c)) lastImplIdx = idx;
    });

    const pending = sorted.slice(lastImplIdx + 1);
    const hasReworkNote = pending.some((c) => {
      const role = commentRole(c);
      return role === 'planner' || role === 'user';
    });
    if (!hasReworkNote) {
      return {
        ok: false,
        reasonCode: 'no-rework-note',
        reason: `issue #${target.number} 尚無規劃者或使用者退回說明，暫不交由新對話接手`,
      };
    }

    const latestMs = Date.parse(pending[pending.length - 1].created_at || '') || 0;
    if (nowMs - latestMs < graceMs) {
      return {
        ok: false,
        reasonCode: 'grace',
        reason: `issue #${target.number} 最後一則留言不到 ${Math.round(graceMs / 60000)} 分鐘，先留給原本的對話`,
      };
    }
    return { ok: true, pendingComments: pending };
  }

  /**
   * @why 測試檔案、對照資料夾（fixtures／golden／vectors／vectors-*）、Markdown 文件、
   *      依賴鎖定檔與設定指定的自動產生路徑都不算業務程式改動行數。
   */
  function isExcludedFromBusinessLineCount(filePath: string): boolean {
    const p = normalizeRepoRelPath(filePath);
    if (!p) return false;
    const segs = p.split('/').filter(Boolean);
    const dirSegs = segs.slice(0, -1);
    const fileName = segs[segs.length - 1] || '';

    if (
      dirSegs.some(
        (seg) =>
          seg === 'tests' ||
          seg === 'fixtures' ||
          seg === 'golden' ||
          seg === 'vectors' ||
          seg.startsWith('vectors-'),
      )
    ) {
      return true;
    }
    if (/^[^/]+\.(test|spec)\.[^/]+$/i.test(fileName) || /\.md$/i.test(fileName)) return true;
    if (
      /\.lock$/i.test(fileName) ||
      fileName === 'package-lock.json' ||
      fileName === 'pnpm-lock.yaml' ||
      fileName === 'yarn.lock'
    ) {
      return true;
    }
    return generatedPatterns.some((pattern) => fileMatchesPattern(p, pattern));
  }

  function analyzeBusinessAddedLines({
    repoEntries = [],
    defaultLimit = businessLineLimit,
    limitOverride = null,
  }: AnalyzeBusinessLinesOptions = {}): BusinessLineAnalysis {
    const limit =
      typeof limitOverride === 'number' && Number.isSafeInteger(limitOverride) && limitOverride > 0
        ? limitOverride
        : defaultLimit;
    const files: BusinessLineFileStat[] = [];
    let totalAdded = 0;
    let totalRawAdded = 0;
    let totalMoved = 0;

    for (const repoEntry of repoEntries) {
      const repo = repoEntry.repo;
      const numstatEntries = Array.isArray(repoEntry.numstatEntries) ? repoEntry.numstatEntries : [];
      const diffByFile = repoEntry.diffByFile || { addedByFile: new Map<string, string[]>(), deletedByFile: new Map<string, string[]>() };

      const deletedPool = new Map<string, number>();
      for (const [delPath, delLines] of diffByFile.deletedByFile.entries()) {
        if (isExcludedFromBusinessLineCount(delPath)) continue;
        for (const content of delLines) deletedPool.set(content, (deletedPool.get(content) || 0) + 1);
      }

      for (const entry of numstatEntries) {
        if (entry.binary || isExcludedFromBusinessLineCount(entry.path)) continue;
        const rawAdded = entry.added || 0;
        const addedLines = diffByFile.addedByFile.get(entry.path) || [];
        let matchedMoved = 0;
        for (const content of addedLines) {
          const avail = deletedPool.get(content) || 0;
          if (avail > 0) {
            deletedPool.set(content, avail - 1);
            matchedMoved += 1;
          }
        }
        const movedCount = Math.min(rawAdded, matchedMoved);
        const netAdded = Math.max(0, rawAdded - movedCount);
        totalRawAdded += rawAdded;
        totalMoved += movedCount;
        totalAdded += netAdded;
        if (rawAdded > 0 || netAdded > 0) {
          files.push({ repo, path: entry.path, raw: `${repo}:${entry.path}`, rawAdded, movedCount, added: netAdded });
        }
      }
    }

    return { limit, totalAdded, totalRawAdded, totalMoved, exceeded: totalAdded > limit, files };
  }

  return {
    repos,
    defaultRepo,
    businessLineLimit,
    softFileLineLimit,
    reworkGraceMs,
    commentRole,
    findLatestDispatchComment,
    parseScopeSection,
    scopeEntriesOverlap,
    fileMatchesScopeEntry,
    findOutOfScopeFiles,
    checkScopePrecision,
    requiresThreeQuestionsCheck,
    checkThreeQuestions,
    evaluateIssueCanStart,
    evaluateIssueCanResume,
    isIssueOwnedBySession,
    classifyOwnedIssue,
    parseBusinessLineLimit: (body, defaultLimit = businessLineLimit) => parseBusinessLineLimitValue(body, defaultLimit),
    isExcludedFromBusinessLineCount,
    analyzeBusinessAddedLines,
  };
}
