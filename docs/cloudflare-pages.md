# 游戏发布入口

主分享地址：https://shanye-zhenhuo.pages.dev/

Cloudflare 账号：e1dafe9be81ab15cf48a70e743e08dcd；Pages 项目：shanye-zhenhuo；生产分支标记：master。
此标记属于部署环境，不需要新建 Git 分支。

2026-09-13 使用现有 dist 成品直接发布，包含 10cac8b 对应的最新平衡调整。
首页、游戏页、主脚本、五行图片、开场视频和背景音乐均经 curl --noproxy '*' 直连返回 200；主脚本 SHA256 与本地成品一致。
这次核对代表当前网络的结果，不代表所有手机运营商的连通性。

后续更新使用已授权的 Wrangler 执行：

```sh
wrangler pages deploy dist --project-name shanye-zhenhuo --branch master
```

此 Pages 项目使用直接上传；现有 GitHub master 的自动构建仍然只更新 aierya Worker，不能视为已经同步 Pages。
发布后必须无代理检查 Pages 首页及实际游戏资源，不要只用代理验收。

备用 Worker 地址：https://aierya.tylergao11.workers.dev/ 。本次检查直连超时，显式代理访问为 200，不再作为国内分享的默认入口。
现有 comdr-download Pages 项目未改动。
