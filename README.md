# 仙剑 · 锁妖剑台 — 李逍遥 3D 写实动作游戏（Web + Android APK 跨端联机）

基于 **Three.js WebGL2 + Capacitor Android + Python AsyncIO WebSocket** 构建的中国风写实 3D 动作游戏，支持电脑浏览器、手机浏览器、Android 原生 APK 跨端同房联机。

## 在线游玩
- 正式网页版：https://fwpt.cn/lixiaoyao/
- 直达第三关镇狱妖王：https://fwpt.cn/lixiaoyao/?stage=3
- 开启手游王者荣耀轮盘预览：https://fwpt.cn/lixiaoyao/?wheel
- 全员写实模型展示台：https://fwpt.cn/lixiaoyao/?show=char

## 核心特性
1. **全员写实人类 PBR 模型**：李逍遥、蜀山同门玄影、第一关玄铁魔兵、幽冥玄道、第二关血甲剑魔精英、第三关镇狱妖王均采用真人校准面部贴图 + Sobel 法线 + 战损玄铁甲/汉服织锦 PBR 材质。
2. **三关递进闯关 & 高仿真剑诀特效**：蜀山山门 → 剑冢残碑（血甲剑魔） → 锁妖剑台（镇狱妖王），配备锻钢飞剑、焦土裂纹法阵、巨型天剑雷环、青翠灵葫旋涡与弹反火星迸溅。
3. **高仿真物理浮雕技能键 + 王者荣耀轮盘手感**：立体青铜古玉浮雕按键、扇形冷却扫光、按压凹陷与震动回弹，手机/APK 默认横屏沉浸、左手悬浮摇杆 + 右手大普攻弧形技能轮盘，带自适应 DPR 60fps 调频。
4. **跨端双人实时联机**：接入 `wss://fwpt.cn/lixiaoyao/ws`，支持 **4 位房间码建房/加入** 与 **快速匹配**，畅玩 **双人组队刷怪（Co-op，支持倒地靠近救援）** 与 **双人 1v1 联网 Solo 单挑**。

## Android APK 下载与 GitHub 云端自动打包
- **直接下载安装包**：前往 [GitHub Releases](https://github.com/wmsir/shushan-lixiaoyao-3d/releases) 下载 `lixiaoyao-3d-release.apk` 安装到安卓手机即可与网页版跨端联机。
- **自动构建流水线**：仓库已内置 Capacitor Android 原生 Gradle 工程与 `.github/workflows/build-android-apk.yml`，每次推送 `main` 或打 `v*` 标签都会在 GitHub `ubuntu-latest` 上约 2 分钟自动产出签名 `.apk` 并发布 Release。

## 本地开发常用命令
```bash
npm install
npm run dev          # 本地热更新调试
npm run build        # 编译生产 Web 包
npm run cap:sync     # 编译并同步到 Capacitor Android 工程
python server/mp_server.py  # 本地启动联机房间服 (默认端口 18099)
```
