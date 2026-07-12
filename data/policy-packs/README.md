# 城市政策包目录

本目录用于放置已经逐条核验官方来源的城市政策包 JSON。当前仓库暂不内置任何城市真实补贴金额，避免把未核验或已过期的地方规则误导为可直接使用。

政策包进入本目录前必须满足：

- `name`、`version`、`region`、`effectiveFrom`、`effectiveTo`、`lastVerifiedAt` 完整。
- `sources` 至少包含一个主管部门 HTTPS 官方公告入口，不能使用新闻转载、销售海报或示例链接。
- 金额、比例、封顶值、适用车型、申请条件和有效期均能从官方来源追溯。
- 执行 `npm run policy:validate` 通过。

模板见 [`../policy-template.json`](../policy-template.json)。地方政策经常变化，已发布政策包也需要在有效期前后复核。
