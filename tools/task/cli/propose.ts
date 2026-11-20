// @module templates/bin/task/cli/propose
// @role 通用 task 工具的套件回報指令：實作 task propose（指紋去重並回報問題或建議給套件上游）
// @why 讓使用套件的專案主動以摘要與連結回報規則或工具建議，同一件事以指紋合併而不重複開單
// @forbid 禁止在 --dry-run 時發送寫入請求或略過指紋去重直接開新單
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parsePaginatedJsonArrays } from '../lib.ts';
import type { ProposeArea, ProposeCommandArgs, ProposeRole, TaskContext } from '../types.ts';
import { fail, runGh } from './runtime.ts';

const REPO_SLUG_RE = /^[^/\s]+\/[^/\s]+$/;

interface OpenFeedbackIssue {
  number: number;
  body?: string | null;
}

interface FeedbackBodyOptions {
  project: string;
  issueRepo: string;
  kitVersion: string;
  area: ProposeArea;
  target: string;
  what: string;
  suggest: string;
  refs: readonly string[];
  role: ProposeRole;
  worker: string;
  fingerprint: string;
  includeFingerprint: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isOpenFeedbackIssue(value: unknown): value is OpenFeedbackIssue {
  return isRecord(value) && !value.pull_request && value.state !== 'closed' && typeof value.number === 'number';
}

/**
 * 依目標對象與標題計算 12 碼十六進位去重指紋。
 * @why 忽略對象頭尾空白與大小寫、並將標題連續空白縮成單一空白，避免些微排版差異造成重複開單。
 */
export function computeFeedbackFingerprint(target: string, title: string): string {
  const normalizedTarget = String(target || '').trim().toLowerCase();
  const normalizedTitle = String(title || '').trim().replace(/\s+/g, ' ').toLowerCase();
  return createHash('sha256')
    .update(`${normalizedTarget}\n${normalizedTitle}`)
    .digest('hex')
    .slice(0, 12);
}

function resolveKitUpstream(ctx: TaskContext): string {
  const raw = ctx.config?.kitUpstream;
  if (typeof raw !== 'string' || !raw.trim()) {
    fail('設定檔缺少 kitUpstream（請在 project.config.json 設定套件上游倉庫 owner/name）');
  }
  const upstream = raw.trim();
  if (!REPO_SLUG_RE.test(upstream)) {
    fail(`設定檔的 kitUpstream 格式錯誤（應為 owner/name）：${upstream}`);
  }
  return upstream;
}

function resolveKitVersion(ctx: TaskContext): string {
  if (ctx?.configDir) {
    const manifestPath = path.join(ctx.configDir, '.kit', 'manifest.json');
    try {
      const manifest: unknown = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const manifestVer = isRecord(manifest) ? manifest.kitVersion : undefined;
      if (typeof manifestVer === 'string' && manifestVer.trim()) {
        return manifestVer.trim();
      }
    } catch {
      // @why 沒有安裝套件清單或讀取失敗時改用設定檔的 kitVersion
    }
  }
  const raw = ctx.config?.kitVersion;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : '未知';
}

function formatRefs(refs: readonly string[], issueRepo: string): string[] {
  if (!Array.isArray(refs) || refs.length === 0) {
    return ['- （無）'];
  }
  return refs.map((ref) => {
    const trimmed = String(ref || '').trim();
    const formatted = trimmed.startsWith('#') ? `${issueRepo}${trimmed}` : trimmed;
    return `- ${formatted}`;
  });
}

function buildFeedbackBody({
  project,
  issueRepo,
  kitVersion,
  area,
  target,
  what,
  suggest,
  refs,
  role,
  worker,
  fingerprint,
  includeFingerprint,
}: FeedbackBodyOptions): string {
  const header =
    role === 'implementer'
      ? `🛠️ ${worker}（來自 ${project}）`
      : `🤖 Claude（來自 ${project}）`;

  const lines = [
    header,
    '',
    '## 來源',
    `- 專案：${project}（${issueRepo}）`,
    `- 套件版本：${kitVersion}`,
    '',
    '## 相關',
    `- 類別：${area}`,
    `- 對象：${target}`,
    '',
    '## 發生什麼',
    what,
    '',
    '## 建議',
    suggest,
    '',
    '## 參考',
    ...formatRefs(refs, issueRepo),
  ];

  if (includeFingerprint) {
    lines.push('', `<!-- kit-feedback fp:${fingerprint} -->`);
  }

  return lines.join('\n');
}

function fetchOpenKitFeedbackIssues(kitUpstream: string): OpenFeedbackIssue[] {
  const raw = runGh([
    'api',
    `repos/${kitUpstream}/issues?labels=type:kit-feedback&state=open&per_page=100`,
    '--paginate',
  ]);
  return parsePaginatedJsonArrays(raw).filter(isOpenFeedbackIssue);
}

function findMatchingFeedbackIssue(
  issues: readonly OpenFeedbackIssue[],
  fingerprint: string,
): OpenFeedbackIssue | null {
  const fpPattern = new RegExp(`kit-feedback fp:${fingerprint}(?![0-9a-fA-F])`);
  return issues.find((it) => typeof it.body === 'string' && fpPattern.test(it.body)) || null;
}

/** 執行 `task propose`：先查上游是否已有同指紋回報單，有則補充留言、無則開新單。 */
export function cmdPropose(
  ctx: TaskContext,
  opts: Pick<ProposeCommandArgs, 'title' | 'target' | 'what' | 'suggest' | 'area' | 'refs' | 'role' | 'worker' | 'dryRun'>,
): number {
  const kitUpstream = resolveKitUpstream(ctx);
  const kitVersion = resolveKitVersion(ctx);
  const { title, target, what, suggest, area, refs, role, worker, dryRun } = opts;

  const fingerprint = computeFeedbackFingerprint(target, title);
  const openIssues = fetchOpenKitFeedbackIssues(kitUpstream);
  const existing = findMatchingFeedbackIssue(openIssues, fingerprint);

  const mode = existing ? 'appended' : 'new';
  const body = buildFeedbackBody({
    project: ctx.project,
    issueRepo: ctx.issueRepo,
    kitVersion,
    area,
    target,
    what,
    suggest,
    refs,
    role,
    worker,
    fingerprint,
    includeFingerprint: !existing,
  });

  if (dryRun) {
    if (existing) {
      console.log(`KIT_FEEDBACK=${kitUpstream}#${existing.number}`);
    }
    console.log(`MODE=${mode}`);
    if (!existing) {
      console.log(`TITLE=[套件回報] ${title}`);
    }
    console.log('---');
    console.log(body);
    return 0;
  }

  if (existing) {
    runGh(
      ['api', '-X', 'POST', `repos/${kitUpstream}/issues/${existing.number}/comments`, '-F', 'body=@-'],
      body,
    );
    console.log(`KIT_FEEDBACK=${kitUpstream}#${existing.number}`);
    console.log('MODE=appended');
    return 0;
  }

  const payload = {
    title: `[套件回報] ${title}`,
    body,
    labels: ['type:kit-feedback'],
  };
  const raw = runGh(
    ['api', '-X', 'POST', `repos/${kitUpstream}/issues`, '--input', '-'],
    JSON.stringify(payload),
  );
  let created: unknown;
  try {
    created = JSON.parse(raw);
  } catch (err: unknown) {
    fail(`解析上游回報單回應失敗：${err instanceof Error ? err.message : String(err)}`);
  }
  const number = isRecord(created) ? created.number : undefined;
  if (typeof number !== 'number' || !Number.isSafeInteger(number) || number <= 0) {
    fail(`上游建立回報單回應缺少有效的單號：${raw}`);
  }
  console.log(`KIT_FEEDBACK=${kitUpstream}#${number}`);
  console.log('MODE=new');
  return 0;
}
