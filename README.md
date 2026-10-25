# Aurora HTML Studio

本仓库用于发布 Aurora HTML Studio 的安装包，软件内置的「自动更新」从这里的 [Releases](https://github.com/SAWA-25/AuroraHTMLStudio/releases) 获取新版本。

## 下载

到 [Releases](https://github.com/SAWA-25/AuroraHTMLStudio/releases/latest) 下载 `AuroraHTMLStudio-full-v*.zip`，解压后双击 `AuroraStudio.exe`。

## 自动更新

软件启动时自动检查（也可在 设置 → 软件更新 手动检查）：

- 内置酒馆没变 → 只下载 `*-app-*.zip` 小包（界面 + 程序，几 MB）
- 内置酒馆升级了 → 下载 `*-full-*.zip` 完整包

更新前自动备份，失败自动回滚；`data` 文件夹（项目、对话、设置）不会被改动。

## 发布新版本（开发者）

```
node build/make-release.cjs 6.1.0 --notes "更新说明"
node build/publish-release.cjs
```

`manifest.json` 的 `st` 字段为内置酒馆版本，决定用户下载小包还是完整包。
