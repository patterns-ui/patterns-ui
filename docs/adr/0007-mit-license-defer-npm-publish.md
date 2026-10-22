# license 定 MIT，但暂不 npm publish

对外分发走 GitHub 私有 registry（shadcn add 直连仓库），changesets 仅产出 tag 与 CHANGELOG；publint / attw 留在 CI 保证随时可发。公开发布推迟到 M8 模式库成熟后再议——第一批消费者是自家两个 console，半成品公开发布只会透支 semver 信誉。

## Consequences

- 公开发布前是仓库与包名更名的最后低成本窗口（包名、registry URL、skills 分发名都要跟着改）。
