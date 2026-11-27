# 規則登記表

每條規則一列。缺「觸發點」或「機器檢查」的規則不算落地；30 天沒被引用或確認的規則由每日稽核列出。

| 規則 | 出處 | 觸發點（在哪一步生效） | 機器檢查 | 最後確認 |
| :--- | :--- | :--- | :--- | :--- |
| 驗收測試與鎖定檔不得修改 | `AGENTS.md` 第 5 節 | 交件、驗收 | `task accept` 鎖定 commit 比對 | 2026-11-28 |
| 只改單上影響範圍內的檔 | 協議第 3 節 | 交件、驗收 | `task accept` 範圍比對 | 2026-11-28 |
| 未 `status:ready` 且無派工留言不得動工 | 協議第 5 節 | 接單 | `task wait` 只挑合格的單 | 2026-11-28 |
| 驗收員不得由實作者擔任 | `AGENTS.md` 第 2 節 | 驗收 | 證據包記錄驗收員代號，與實作者比對 | 2026-11-28 |
| 單檔行數上限 | `AGENTS.md` 第 6 節 | 交件 | `task accept` 行數檢查 | 2026-11-28 |
| 規則或工具的問題回報給套件上游 | 協議第 11 節 | 寫防再犯規則、工具誤判、協調者退休、改規則檔 | `task propose`（指紋去重） | 2026-11-28 |
| 註解三必寫（檔頭 `@module/@role/@forbid`、`@why`、`@lock`） | `AGENTS.md` 第 6 節 | 交件、驗收 | `task accept` 檢查改到的檔案的檔頭；改到 `@lock` 要有 `## 解鎖` | 2026-11-28 |
| 不寫死（`forbiddenPatterns`） | `AGENTS.md` 第 6 節 | 驗收 | `task accept` 掃改到的檔案 | 2026-11-28 |
| 建置產物不進版本控制 | `AGENTS.md` 第 6 節 | 驗收 | `task accept` 擋 `generatedPaths` 以外的產物 | 2026-11-28 |
| 規則檔在各 agent 工具的上限內 | 協議第 12 節 | 初始化、`kit-check`、改到規則檔的驗收 | `task kit-check`、`task accept` | 2026-11-28 |
| 暫時資源帶擁有者並零殘留 | 協議第 16 節 | 驗收 | `task accept` 暫時資源殘留 | 2026-11-28 |
| 資源整體上限 | 協議第 16 節 | 每日稽核 | `task resource-check` | 2026-11-28 |
| 驗收不得改動主資料夾 | 協議第 16 節 | 驗收 | `task accept` 主資料夾改動 | 2026-11-28 |
| 建置產物超過上限自動清理 | 協議第 16 節 | 每日稽核 | `task resource-check --clean` | 2026-11-28 |
| Rust 開發模式精簡除錯資訊 | 協議第 15 節 | 初始化、`kit-check` | `task kit-check`（`KIT-RUST-DEBUG`） | 2026-11-28 |
| 鎖定測試標壽命（`@lifetime: once`／`regression`），單次測試合併後移除 | 協議第 3 節 | 交件、驗收、合併、`kit-check` | `task submit`／`task accept`（`test-lifetime-missing`）、`task merge`（`TEST-ONCE`）、`task kit-check`（`KIT-TEST-ONCE`） | 2026-11-28 |
| Rust 每個 crate 一個測試執行檔、測試檔都要登記在入口 | 協議第 15 節 | 交件、驗收、`kit-check` | `task submit`／`task accept`（`rust-test-unregistered`）、`task kit-check`（`KIT-RUST-TESTS`） | 2026-11-28 |

## 專案規則

本節登記本專案自己的規則；`init --upgrade` 保留本節不覆蓋，`task kit-check` 不算改動。

| 規則 | 出處 | 觸發點（在哪一步生效） | 機器檢查 | 最後確認 |
| :--- | :--- | :--- | :--- | :--- |
