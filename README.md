# 游戏大厅 games.renjia731.ccwu.cc

把一批开源网页小游戏组装成一个静态站点（Cloudflare Pages）。游戏清单在 `games.json`，
每个游戏来自 `renjiaandy-art` 下对应的 fork；`build.py` 负责拉取、构建、去掉广告/统计代码、
做少量修补（见脚本里的 PATCHES），并生成大厅首页。各游戏的原始协议和上游地址见 `games.json`
和大厅页面底部。本仓库自身的代码（build.py、大厅页面）以 MIT 协议发布。

## 原创经典 originals/

`originals/<slug>/` 是本仓库自己写的游戏（MIT，见 LICENSE），每个目录一个自包含的静态游戏：
`index.html` + `meta.json`（slug、name 中文名、desc、icon emoji、howto、credits 素材来源）。
可选使用共用小工具库 `../common/rj-game.js`（开始/结束界面、HUD、最高分、自适应画布、触屏坐标、合成音效）。
规则：不引用外部 CDN/网络资源，素材只用自绘或 CC0（在 credits 里注明），不使用任何原作名称、商标、角色、美术或关卡。
build.py 会自动收录有 meta.json 的目录，放进大厅「原创经典」分区，并报告外部引用。
