// @module templates/bin/task-shim
// @role 專案工具轉接檔（寫入專案 tools/task.ts）：依設定取得對應版本套件 templates/ 後執行主程式
// @why 套件改為 Home Repo 引用模式，專案只保留單一純內建轉接檔，不複製整套工具與文件
// @forbid 禁止 import 非 node: 內建模組、寫死任何倉庫名或作者名、實作套件主程式其他子指令邏輯

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_CHECK_INTERVAL_SEC = 600;
const LOCK_TIMEOUT_MS = 60_000;
const LOCK_STALE_MS = 60_000;
const LOCK_POLL_MS = 50;
const GIT_TIMEOUT_MS = 60_000;
const SHA_RE = /^[0-9a-f]{40}$/i;
const SLUG_RE = /^[^/\s]+\/[^/\s]+$/;
const ALWAYS_CHECK_SUBCMDS = new Set(['kit-fetch', 'accept', 'merge', 'kit-check']);
const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' };

interface ShimConfig {
  mainRoot: string;
  kitRoot: string;
  lockPath: string;
  kitUpstream: string;
  upstreamUrl: string;
  kitRef: string;
  tagName: string;
}

function isKind(p: string, dir = false): boolean {
  try {
    const st = fs.statSync(p);
    return dir ? st.isDirectory() : st.isFile();
  } catch {
    return false;
  }
}

const rm = (p: string): void => fs.rmSync(p, { recursive: true, force: true });
const entryInCache = (dir: string): string => path.join(dir, 'templates', 'bin', 'task', 'main.ts');

function failShim(message: string): null {
  process.stderr.write(`${message}\n`);
  process.exitCode = 2;
  return null;
}

function runGit(cwd: string, args: readonly string[]): { status: number | null; stdout: string; stderr: string } {
  const res = spawnSync('git', [...args], { cwd, encoding: 'utf8', timeout: GIT_TIMEOUT_MS, env: GIT_ENV });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

function mustGit(cwd: string, args: readonly string[]): string {
  const res = runGit(cwd, args);
  if (res.status !== 0) {
    throw new Error(`git ${args.join(' ')} 失敗：${res.stderr.trim() || res.stdout.trim() || String(res.status)}`);
  }
  return res.stdout.trim();
}

function findConfigPath(startDir: string): string | null {
  const envPath = process.env.TASK_CONFIG?.trim() ?? '';
  if (envPath) {
    const resolved = path.resolve(startDir, envPath);
    return isKind(resolved) ? resolved : failShim(`找不到指定的設定檔 TASK_CONFIG：${resolved}`);
  }
  let cur = path.resolve(startDir);
  while (true) {
    const candidate = path.join(cur, 'project.config.json');
    if (isKind(candidate)) return candidate;
    const parent = path.dirname(cur);
    if (parent === cur) return failShim(`找不到 project.config.json（從 ${startDir} 往上搜尋失敗）`);
    cur = parent;
  }
}

function resolveMainRoot(projRoot: string): string {
  const res = runGit(projRoot, ['rev-parse', '--git-common-dir']);
  const raw = res.status === 0 ? res.stdout.trim() : '';
  if (!raw) return projRoot;
  const resolved = path.resolve(projRoot, raw);
  return path.basename(resolved) === '.git' ? path.dirname(resolved) : projRoot;
}

function readJsonObject(filePath: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${filePath} 必須為 JSON 物件`);
  return parsed as Record<string, unknown>;
}

function isValidKitRef(value: string): boolean {
  if (value === 'stable') return true;
  return value.startsWith('kit-v') && !/\s/.test(value) && value.slice(5).trim().length > 0;
}

function loadConfig(configPath: string): ShimConfig | null {
  let cfgObj: Record<string, unknown>;
  try {
    cfgObj = readJsonObject(configPath);
  } catch (err: unknown) {
    return failShim(`讀取 ${path.basename(configPath)} 失敗：${err instanceof Error ? err.message : String(err)}`);
  }
  const kitUpstream = typeof cfgObj.kitUpstream === 'string' ? cfgObj.kitUpstream.trim() : '';
  if (!kitUpstream || !SLUG_RE.test(kitUpstream)) {
    return failShim(`設定檔錯誤：${path.basename(configPath)} 缺少有效的 kitUpstream（格式 <owner>/<repo>）`);
  }
  const projRoot = path.dirname(configPath);
  const mainRoot = resolveMainRoot(projRoot);
  const manifestPath = [projRoot, mainRoot].map((r) => path.join(r, '.kit', 'manifest.json')).find((p) => isKind(p)) ?? null;
  let kitRef = 'stable';
  if (manifestPath !== null) {
    let manifestObj: Record<string, unknown>;
    try {
      manifestObj = readJsonObject(manifestPath);
    } catch (err: unknown) {
      return failShim(`讀取 .kit/manifest.json（kitRef）失敗：${err instanceof Error ? err.message : String(err)}`);
    }
    if (manifestObj.kitRef !== undefined) {
      if (typeof manifestObj.kitRef !== 'string' || !isValidKitRef(manifestObj.kitRef)) {
        return failShim(`設定檔錯誤：不合法的 kitRef「${String(manifestObj.kitRef)}」，只接受 stable 或 kit-v<版本>`);
      }
      kitRef = manifestObj.kitRef;
    }
  }
  const upstreamUrl = (process.env.TASK_KIT_UPSTREAM_URL?.trim() ?? '') || `https://github.com/${kitUpstream}.git`;
  const kitRoot = path.join(mainRoot, '.kit', 'kit');
  const lockPath = path.join(mainRoot, '.kit', 'kit.lock');
  return { mainRoot, kitRoot, lockPath, kitUpstream, upstreamUrl, kitRef, tagName: kitRef === 'stable' ? 'kit-stable' : kitRef };
}

function readValidCurrent(kitRoot: string): string | null {
  const curFile = path.join(kitRoot, 'current');
  if (!isKind(curFile)) return null;
  const sha = fs.readFileSync(curFile, 'utf8').trim();
  return SHA_RE.test(sha) && isKind(entryInCache(path.join(kitRoot, sha))) ? sha.toLowerCase() : null;
}

interface CheckedMeta {
  ms: number;
  kitRef: string | null;
  commit: string | null;
}

function readCheckedMeta(kitRoot: string): CheckedMeta | null {
  const checkedFile = path.join(kitRoot, 'checked-at');
  if (!isKind(checkedFile)) return null;
  const lines = fs.readFileSync(checkedFile, 'utf8').split(/\r?\n/);
  const rawTime = (lines[0] ?? '').trim();
  const ms = /^\d+$/.test(rawTime) ? Number(rawTime) : Date.parse(rawTime);
  if (!Number.isFinite(ms)) return null;
  const rawRef = (lines[1] ?? '').trim();
  const rawCommit = (lines[2] ?? '').trim().toLowerCase();
  return { ms, kitRef: rawRef || null, commit: SHA_RE.test(rawCommit) ? rawCommit : null };
}

function canReuseCurrent(cfg: ShimConfig, currentSha: string | null, subcmd: string, intervalSec: number): currentSha is string {
  if (currentSha === null || subcmd === 'kit-fetch') return false;
  const meta = readCheckedMeta(cfg.kitRoot);
  if (meta === null || meta.kitRef !== cfg.kitRef) return false;
  if (meta.commit !== null && meta.commit !== currentSha) return false;
  if (cfg.tagName !== 'kit-stable') return true;
  if (ALWAYS_CHECK_SUBCMDS.has(subcmd) || intervalSec <= 0) return false;
  const elapsed = Date.now() - meta.ms;
  return elapsed >= 0 && elapsed < intervalSec * 1000;
}

function writeFileAtomic(dir: string, filename: string, content: string): void {
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.tmp-file-${process.pid}-${randomBytes(4).toString('hex')}`);
  try {
    fs.writeFileSync(tmp, content, 'utf8');
    fs.renameSync(tmp, path.join(dir, filename));
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

async function withLock<T>(lockPath: string, fn: () => Promise<T>): Promise<T> {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  while (true) {
    try {
      fs.mkdirSync(lockPath);
      break;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        fs.mkdirSync(path.dirname(lockPath), { recursive: true });
        continue;
      }
      if (code !== 'EEXIST') throw err;
      try {
        if (Date.now() - fs.statSync(lockPath).mtimeMs > LOCK_STALE_MS) {
          rm(lockPath);
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() >= deadline) throw new Error(`等待鎖定逾時（${LOCK_TIMEOUT_MS / 1000} 秒）：${lockPath}`);
      await new Promise<void>((resolve) => setTimeout(resolve, LOCK_POLL_MS));
    }
  }
  try {
    return await fn();
  } finally {
    rm(lockPath);
  }
}

function parseLsRemoteRef(stdout: string, refName: string): string | null {
  let direct: string | null = null;
  let peeled: string | null = null;
  let head: string | null = null;
  const tagRef = `refs/tags/${refName}`;
  const headRef = `refs/heads/${refName}`;
  for (const line of stdout.split(/\r?\n/)) {
    const [sha, ref] = line.trim().split(/\s+/);
    if (!sha || !ref || !SHA_RE.test(sha)) continue;
    if (ref === `${tagRef}^{}`) peeled = sha.toLowerCase();
    else if (ref === tagRef) direct = sha.toLowerCase();
    else if (ref === headRef) head = sha.toLowerCase();
  }
  return peeled ?? direct ?? head;
}

function normalizeGithubSlug(url: string): string | null {
  const trimmed = url.trim().replace(/\/+$/, '').replace(/\.git$/i, '');
  const ssh = /^git@github\.com:([^/]+\/[^/]+)$/i.exec(trimmed);
  if (ssh) return ssh[1].toLowerCase();
  const uri = /^(?:https?|ssh):\/\/(?:[^@/\s]+@)?github\.com(?::\d+)?[:/]([^/]+\/[^/]+)$/i.exec(trimmed);
  return uri ? uri[1].toLowerCase() : null;
}

function findAdjacentClones(mainRoot: string, kitUpstream: string, upstreamUrl: string): string[] {
  const parentDir = path.dirname(mainRoot);
  if (!isKind(parentDir, true)) return [];
  const targetSlug = kitUpstream.toLowerCase();
  const out: string[] = [];
  for (const ent of fs.readdirSync(parentDir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const dir = path.join(parentDir, ent.name);
    if (!fs.existsSync(path.join(dir, '.git')) && !isKind(path.join(dir, 'HEAD'))) continue;
    const origin = runGit(dir, ['remote', 'get-url', 'origin']);
    const url = origin.status === 0 ? origin.stdout.trim() : '';
    if (url && (normalizeGithubSlug(url) === targetSlug || url === upstreamUrl)) out.push(dir);
  }
  return out;
}

function configureSparseTemplates(repoDir: string): void {
  const noCone = runGit(repoDir, ['sparse-checkout', 'set', '--no-cone', '/templates/']);
  if (noCone.status !== 0) mustGit(repoDir, ['sparse-checkout', 'set', 'templates']);
}

function ensureCachedVersion(kitRoot: string, commitSha: string, tagName: string, upstreamUrl: string, localDir: string | null): string {
  if (isKind(entryInCache(path.join(kitRoot, commitSha)))) return commitSha;
  fs.mkdirSync(kitRoot, { recursive: true });
  const suffix = `${process.pid}-${randomBytes(4).toString('hex')}`;
  const tmpRepo = path.join(kitRoot, `.tmp-repo-${suffix}`);
  const tmpStage = path.join(kitRoot, `.tmp-stage-${suffix}`);
  try {
    let finalSha = commitSha;
    if (localDir !== null) {
      const objDir = path.resolve(localDir, mustGit(localDir, ['rev-parse', '--git-path', 'objects']));
      fs.mkdirSync(tmpRepo, { recursive: true });
      mustGit(tmpRepo, ['init', '-q']);
      fs.mkdirSync(path.join(tmpRepo, '.git', 'objects', 'info'), { recursive: true });
      fs.writeFileSync(path.join(tmpRepo, '.git', 'objects', 'info', 'alternates'), `${objDir}\n`, 'utf8');
      configureSparseTemplates(tmpRepo);
      mustGit(tmpRepo, ['checkout', '-q', '--detach', commitSha]);
    } else {
      const base = ['clone', '-q', '--depth', '1', '--branch', tagName];
      const filtered = runGit(kitRoot, [...base, '--filter=blob:none', '--sparse', '--no-checkout', upstreamUrl, tmpRepo]);
      if (filtered.status !== 0) {
        rm(tmpRepo);
        mustGit(kitRoot, [...base, '--sparse', '--no-checkout', upstreamUrl, tmpRepo]);
      }
      configureSparseTemplates(tmpRepo);
      const head = mustGit(tmpRepo, ['rev-parse', 'HEAD']).toLowerCase();
      if (head !== commitSha) {
        const tagFetch = runGit(tmpRepo, ['fetch', '-q', '--depth', '1', '--filter=blob:none', 'origin', `refs/tags/${tagName}`]);
        if (tagFetch.status !== 0) runGit(tmpRepo, ['fetch', '-q', '--depth', '1', 'origin', `refs/tags/${tagName}`]);
      }
      if (runGit(tmpRepo, ['cat-file', '-t', commitSha]).stdout.trim() === 'commit') {
        mustGit(tmpRepo, ['checkout', '-q', '--detach', commitSha]);
      } else {
        mustGit(tmpRepo, ['checkout', '-q']);
        if (SHA_RE.test(head)) finalSha = head;
      }
    }
    const srcTemplates = path.join(tmpRepo, 'templates');
    if (!isKind(srcTemplates, true)) throw new Error('取得的套件內容缺少 templates/ 目錄');
    fs.mkdirSync(tmpStage, { recursive: true });
    fs.renameSync(srcTemplates, path.join(tmpStage, 'templates'));
    if (!isKind(entryInCache(tmpStage))) throw new Error('取得的套件缺少 templates/bin/task/main.ts');
    const finalDir = path.join(kitRoot, finalSha);
    if (!isKind(entryInCache(finalDir))) {
      rm(finalDir);
      fs.renameSync(tmpStage, finalDir);
    }
    return finalSha;
  } finally {
    rm(tmpRepo);
    rm(tmpStage);
  }
}

function fetchTargetSha(cfg: ShimConfig, targetSha: string, clones: readonly string[]): string {
  const localMatch = clones.find((d) => runGit(d, ['cat-file', '-t', targetSha]).stdout.trim() === 'commit') ?? null;
  try {
    return ensureCachedVersion(cfg.kitRoot, targetSha, cfg.tagName, cfg.upstreamUrl, localMatch);
  } catch (err: unknown) {
    if (localMatch === null) throw err;
    return ensureCachedVersion(cfg.kitRoot, targetSha, cfg.tagName, cfg.upstreamUrl, null);
  }
}

async function resolveAndFetch(cfg: ShimConfig, subcmd: string, intervalSec: number): Promise<string | null> {
  const fastCurrent = readValidCurrent(cfg.kitRoot);
  if (canReuseCurrent(cfg, fastCurrent, subcmd, intervalSec)) return fastCurrent;
  return await withLock(cfg.lockPath, async () => {
    const lockedCurrent = readValidCurrent(cfg.kitRoot);
    if (canReuseCurrent(cfg, lockedCurrent, subcmd, intervalSec)) return lockedCurrent;
    const ls = runGit(cfg.mainRoot, ['ls-remote', cfg.upstreamUrl, `refs/tags/${cfg.tagName}`, `refs/tags/${cfg.tagName}^{}`, `refs/heads/${cfg.tagName}`]);
    const clones = findAdjacentClones(cfg.mainRoot, cfg.kitUpstream, cfg.upstreamUrl);
    if (ls.status === 0) {
      const targetSha = parseLsRemoteRef(ls.stdout, cfg.tagName);
      if (targetSha === null) return failShim(`無法解析套件版本：上游 ${cfg.upstreamUrl} 找不到標籤或分支 ${cfg.tagName}`);
      try {
        const finalSha = fetchTargetSha(cfg, targetSha, clones);
        writeFileAtomic(cfg.kitRoot, 'current', `${finalSha}\n`);
        writeFileAtomic(cfg.kitRoot, 'checked-at', `${new Date().toISOString()}\n${cfg.kitRef}\n${finalSha}\n`);
        return finalSha;
      } catch (err: unknown) {
        if (lockedCurrent !== null) {
          process.stderr.write(`KIT-FETCH-STALE ${lockedCurrent}\n`);
          return lockedCurrent;
        }
        throw err;
      }
    }
    for (const ref of [`refs/tags/${cfg.tagName}^{commit}`, `refs/remotes/origin/${cfg.tagName}^{commit}`]) {
      for (const dir of clones) {
        const res = runGit(dir, ['rev-parse', '--verify', '--quiet', ref]);
        const sha = res.stdout.trim().toLowerCase();
        if (res.status === 0 && SHA_RE.test(sha)) {
          const finalSha = ensureCachedVersion(cfg.kitRoot, sha, cfg.tagName, cfg.upstreamUrl, dir);
          writeFileAtomic(cfg.kitRoot, 'current', `${finalSha}\n`);
          process.stderr.write(`KIT-FETCH-STALE ${finalSha}\n`);
          return finalSha;
        }
      }
    }
    if (lockedCurrent !== null) {
      process.stderr.write(`KIT-FETCH-STALE ${lockedCurrent}\n`);
      return lockedCurrent;
    }
    return failShim(
      `無法取得套件（上游 ${cfg.upstreamUrl} 無法讀取，且沒有相鄰本機 clone 或既有快取）。\n` +
        '請確認網路連線並完成 GitHub 授權（執行 gh auth login、設定 git HTTPS 憑證或 SSH 金鑰），或以 TASK_KIT_DIR 指定本機套件資料夾。',
    );
  });
}

async function main(): Promise<void> {
  const dirOverride = process.env.TASK_KIT_DIR?.trim() ?? '';
  if (dirOverride) {
    const resolved = path.resolve(dirOverride);
    const entry = [path.join(resolved, 'templates', 'bin', 'task', 'main.ts'), path.join(resolved, 'bin', 'task', 'main.ts')].find((p) => isKind(p)) ?? null;
    if (entry === null) return void failShim(`TASK_KIT_DIR 找不到套件進入點：${resolved}`);
    await import(pathToFileURL(entry).href);
    return;
  }
  const configPath = findConfigPath(process.cwd());
  if (configPath === null) return;
  const cfg = loadConfig(configPath);
  if (cfg === null) return;
  const subcmd = process.argv[2] ?? '';
  const rawInterval = process.env.TASK_KIT_CHECK_INTERVAL_SEC?.trim();
  const parsedInterval = rawInterval ? Number(rawInterval) : DEFAULT_CHECK_INTERVAL_SEC;
  const intervalSec = Number.isFinite(parsedInterval) && parsedInterval >= 0 ? parsedInterval : DEFAULT_CHECK_INTERVAL_SEC;
  const commitSha = await resolveAndFetch(cfg, subcmd, intervalSec);
  if (commitSha === null) return;
  if (subcmd === 'kit-fetch') return void process.stdout.write(`KIT ${cfg.kitRef} ${commitSha}\n`);
  const entry = entryInCache(path.join(cfg.kitRoot, commitSha));
  if (!isKind(entry)) return void failShim(`快取損毀，找不到套件進入點：${entry}`);
  await import(pathToFileURL(entry).href);
}

main().catch((err: unknown) => {
  process.stderr.write(`套件轉接檔執行失敗：${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 2;
});
