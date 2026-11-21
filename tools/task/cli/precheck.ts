// @module templates/bin/task/cli/precheck
// @role 通用 task 工具的規則檔保護與交件前檢查模組：提供 accept 與 submit 共用的受保護檔比對，以及 submit 交件前整合檢查
// @why 將規則檔保護比對與預設受保護清單集中在單一模組，並沿用既有差異摘要跑完規則檔保護與程式規則後再統一決定是否交件
// @forbid 禁止重算 git merge-base 或變更清單、修改工作區或推送分支，或寫死特定專案與測試資料特例

import type {
  ChangedFileEntry,
  IssueDiffSummary,
  PathRuleEntry,
  ScopeParseResult,
  TaskContext,
  TaskLib,
} from '../types.ts';
import { checkAcceptCodeRules, type CodeRuleRepoInput } from './coderules.ts';
import { fileMatchesPathRules, parsePathRuleEntries } from './runtime.ts';

export const DEFAULT_PROTECTED_PATHS = Object.freeze([
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  'docs/**',
  'specs/**',
  'project.config.json',
  'tests/acceptance/**',
  '**/tests/acceptance/**',
  '**/tests/acceptance_*',
  'fixtures/*/expected/**',
]);

const PRECHECK_REJECT_HEADER = '拒絕交件：交件前檢查沒過，請修正後再交件';
const PROTECTED_REJECT_TITLE = '規則檔保護（改到受保護檔，但影響範圍沒有逐字列出）：';
const CODE_RULES_REJECT_TITLE = '程式規則：';

export interface RunSubmitPrecheckOptions {
  ctx: TaskContext;
  scope: Pick<ScopeParseResult, 'entries'>;
  affectedRepos: ReadonlySet<string>;
  issueBody: string | null | undefined;
  summary: IssueDiffSummary;
}

export interface SubmitPrecheckResult {
  passed: boolean;
  commentLine: string;
  errorMessage: string;
}

/** 解析設定檔與預設的受保護路徑清單，供 accept 與 submit 共用。 */
export function parseProtectedPathRules(ctx: Pick<TaskContext, 'config' | 'repoByKey'>): PathRuleEntry[] {
  return parsePathRuleEntries(
    ctx.config.protectedPaths,
    DEFAULT_PROTECTED_PATHS,
    ctx.repoByKey,
    'protectedPaths',
  );
}

/** 檢查變更檔是否命中受保護路徑且未於影響範圍逐字列出，回傳 `<repo>:<path>` 違規清單。 */
export function findProtectedPathViolations(
  lib: TaskLib,
  protectedRules: readonly PathRuleEntry[],
  changedFiles: readonly ChangedFileEntry[],
  scope: Pick<ScopeParseResult, 'entries'>,
): string[] {
  const violations: string[] = [];
  for (const entry of changedFiles) {
    if (fileMatchesPathRules(lib, protectedRules, entry.repo, entry.pattern)) {
      const listedVerbatim = scope.entries.some((e) => e.repo === entry.repo && e.pattern === entry.pattern);
      if (!listedVerbatim) {
        violations.push(entry.raw);
      }
    }
  }
  return violations;
}

/**
 * 執行 S-036 交件前檢查：沿用差異摘要已計算的比對基準與變更清單，跑完規則檔保護與程式規則後再決定是否允許交件。
 */
export function runSubmitPrecheck({
  ctx,
  scope,
  affectedRepos,
  issueBody,
  summary,
}: RunSubmitPrecheckOptions): SubmitPrecheckResult {
  const protectedRules = parseProtectedPathRules(ctx);
  const protectedViolations = findProtectedPathViolations(ctx.lib, protectedRules, summary.changedFiles, scope);

  const repoInputs: CodeRuleRepoInput[] = summary.repoDiffs
    .filter((r) => affectedRepos.has(r.repo.key))
    .map((r) => ({
      repoKey: r.repo.key,
      ok: Boolean(r.wtPath && r.baseSha),
      baseSha: r.baseSha,
      headSha: r.headSha,
      wtPath: r.wtPath,
      fromLockPaths: r.fromLockPaths,
    }));

  const codeRuleCheck = checkAcceptCodeRules({
    config: ctx.config,
    lib: ctx.lib,
    repos: ctx.repos,
    issueBody,
    repoInputs,
  });

  const protectedPassed = protectedViolations.length === 0;
  const codeRulePassed = codeRuleCheck.passed;
  if (protectedPassed && codeRulePassed) {
    return {
      passed: true,
      commentLine: `交件前檢查：規則檔保護 PASS、程式規則 ${codeRuleCheck.status}`,
      errorMessage: '',
    };
  }

  const lines = [PRECHECK_REJECT_HEADER];
  if (!protectedPassed) {
    lines.push(PROTECTED_REJECT_TITLE, ...protectedViolations.map((v) => `- ${v}`));
  }
  if (!codeRulePassed) {
    const ruleLines =
      codeRuleCheck.outputLines.length > 0
        ? codeRuleCheck.outputLines.map((line) => `- ${line}`)
        : ['- 程式規則檢查失敗（無法讀取分支差異或工作資料夾）'];
    lines.push(CODE_RULES_REJECT_TITLE, ...ruleLines);
  }

  return {
    passed: false,
    commentLine: '',
    errorMessage: lines.join('\n'),
  };
}
