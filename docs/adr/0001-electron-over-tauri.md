# ADR-0001 使用 Electron 而不是 Tauri

- 状态：已接受
- 日期：2026-10-15

## 背景

应用只做 Windows。需要移植网易登录协议（VDF、RSA、SM4、多账号 Cookie），并允许第三方用 JS/TS 开发插件。候选方案是 Electron 和 Tauri。

## 决定

使用 Electron。

## 后果

- 好处：全项目一种语言（TypeScript），登录协议、端点契约和界面共用类型；插件逻辑可以放进 `utilityProcess` 隔离运行；Blockbench 等 Electron 插件生态可以参考。
- 代价：安装包较大（约 80–150MB），内存占用高于 Tauri。对开发者工具可以接受。
- 需要高性能计算时，通过 napi-rs 调用 Rust 模块补足，不改宿主。
- 模块化、主题、插件清单等设计与宿主无关，将来更换宿主时可以沿用。
