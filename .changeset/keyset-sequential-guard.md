---
"@patterns-ui/core": patch
---

修复 keyset 分页顺序竞态：`server-cursor` / `load-more` 模式下，第 N+1 页 cursor 未落栈前 `nextPage()` / `loadMore()` 不再前进。修复前快速连点下一页会发出缺 cursor 的请求（服务端返回第 1 页数据被当第 N+1 页渲染），且晚到的第 N 页游标因页面状态已先跳而被追加条件永久丢弃（游标栈断链）。client / server-offset 模式行为不变。
