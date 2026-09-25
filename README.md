# 游戏大厅 games.renjia731.ccwu.cc

把一批开源网页小游戏组装成一个静态站点（Cloudflare Pages）。游戏清单在 `games.json`，
每个游戏来自 `renjiaandy-art` 下对应的 fork；`build.py` 负责拉取、构建、去掉广告/统计代码、
做少量修补（见脚本里的 PATCHES），并生成大厅首页。各游戏的原始协议和上游地址见 `games.json`
和大厅页面底部。本仓库自身的代码（build.py、大厅页面）以 MIT 协议发布。
