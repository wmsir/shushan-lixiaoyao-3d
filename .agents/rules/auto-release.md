---
trigger: always_on
---
# 自动发版与 GitHub Release 规则（无需用户二次确认）

在本仓库（`c:\meng\3D游戏`）中完成任何功能开发、剧情更新、Bug 修复或界面/玩法改动后，**自动完成构建、提交并推送 GitHub 触发双端 Release 打包**，**不要**再向用户询问「是否需要打包/发布/推送」：

1. **版本递增与构建校验**
   - 当本轮改动涉及代码或资源且尚未使用 `npm run version:bump` 升版时，执行 `npm run version:bump` 递增 `APP_VERSION`。
   - 运行 `npm run build`（`tsc --noEmit && vite build`）及必要的 Playwright/功能验证，确认零错误通过。
2. **自动提交并推送 `main`**
   - 执行 `git status --short` 确认无多余临时文件。
   - 自动 `git add -A`、`git commit -m "..."`（清晰概括本次改动与版本号），并执行 `git push origin main`。
   - **禁止**随 `main` 一并推送本地 `v*` tag：因为 [.github/workflows/build-android-apk.yml](.github/workflows/build-android-apk.yml) 已监听 `push` 到 `main` 并会自动编译 Android APK（Release + Debug）与 iOS Unsigned IPA、自动创建对应 `v${APP_VERSION}` tag 并发布最新 GitHub Release；若同时推 tag 会触发重复流水线。
3. **自动触发与验证 GitHub Release 流水线**
   - `git push origin main` 完成后，立即执行 `npm run release:ci`（调用 [scripts/trigger-release.mjs](scripts/trigger-release.mjs)）：若 5 秒内未检测到 `push` 自动创建的 Actions 任务，则自动通过已登录的 `gh` CLI 补发 `gh workflow run build-android-apk.yml --ref main` 并回传新流水线状态。
   - 若 `gh` 尚未登录导致补发失败，先告知用户执行 `gh auth login`，切勿静默跳过发版。
   - 在最终回复中明确汇报：已自动提交推送的版本号、Commit SHA、GitHub Actions 流水线链接（`htmlUrl` 与状态）以及 Release 下载页 `https://github.com/wmsir/shushan-lixiaoyao-3d/releases`。
