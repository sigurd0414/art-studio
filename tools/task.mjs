#!/usr/bin/env node
// @module templates/bin/task
// @role 通用 task 工具命令列薄入口：檢查 Node 22.18 以上 TypeScript 執行支援後載入主程式
// @forbid 禁止在版本檢查前載入任何 .ts 模組，或讓此薄入口超過 30 行

if (!process.features?.typescript) {
  console.error(`需要 Node 22.18 以上才能執行套件（目前 v${process.versions.node}）`);
  process.exitCode = 2;
} else {
  await import('./task/main.ts');
}
