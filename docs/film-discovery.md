# 影片资料与中国大陆正版观看状态

## 本次部署的边界

当前项目未取得或配置 TMDB API 授权。因此本次部署默认不向 TMDB 发出任何请求；简介、年份、导演、演员等缺失字段显示“暂无资料”，六个平台的观看方式显示“未知”。这不表示影片不在平台上，也不表示免费。原有榜单、点播搜索、播放器、直播和密码认证保持原流程。

弹窗涵盖爱奇艺、腾讯视频、优酷、芒果 TV、哔哩哔哩和央视网的官方入口。搜索页面仅供用户自行确认；它从来不是拥有影片或免费可看的证据。

## 后续启用已授权资料接口

此 PR 包含可选的 TMDB 官方 API 适配器，未配置凭据时完全停用。将来启用前必须：

1. 获得适用于本项目用途的 TMDB 授权，确认 API、商业使用、品牌标识及 JustWatch 观看数据的使用条款。参考 [TMDB FAQ](https://developer.themoviedb.org/docs/faq)、[API 认证](https://developer.themoviedb.org/docs/authentication-application)、[电影观看方式](https://developer.themoviedb.org/reference/movie-watch-providers) 和 [剧集观看方式](https://developer.themoviedb.org/reference/tv-series-watch-providers)。遵守官方要求补齐当前有效的品牌标识；页面已有 TMDB/JustWatch 文字出处与 TMDB 免责声明。
2. 在云环境及对应 Vercel 项目的 Preview 设置中安全配置 `TMDB_READ_ACCESS_TOKEN`，允许服务端访问 `api.themoviedb.org`。不要将凭据放在 `NEXT_PUBLIC_*`、代码、日志、PR、聊天或客户端请求中。无需修改现有 `PASSWORD`、`DEFAULT_SOURCES` 或 `DEFAULT_LIVE_SOURCES`。
3. 先在 Preview 使用真实授权接口核对中文片名、原名、年份、电影/剧集、导演演员和地区数据。当前自动化测试使用模拟接口，不能代替这一验收。未完成真实接口及授权/品牌要求验收前，不应在 Production 启用凭据。
4. CN 数据及所需平台可能缺失；即使成功配置授权，也不能承诺六个平台都有可验证数据。缺失时继续显示“未知”。不使用境外地区权益、不把国际版平台等同于大陆版。

## 身份与证据规则

- 通过固定的 TMDB HTTPS 地址访问电影/剧集的 search、details（含 credits）和 watch/providers；带凭据的请求拒绝重定向，不接受用户提供的接口地址。
- 名称只忽略标点、空格和全半角差异；不做子串或模糊命中，不删除续作和季数。已有年份必须一致；没有年份时，即使只有一个候选也要求用户确认具体版本。客户端传来的 ID 必须仍在同一片名、类型和年份的候选中。
- 简介、年份、类型、国家、导演、演员、评分和集数只展示接口明确提供的数据。评分注明 TMDB 来源和人数；缺失导演不会拿主创或制片人代替。
- 观看方式仅接受同一作品 `results.CN` 中明确的 `free`、`ads`、`flatrate`、`rent`、`buy`，分别对应免费、广告免费、会员、租赁、购买。多个方式可以并存。
- 严格匹配所需平台的名称；不将 WeTV、iQIYI International、名称子串或搜索结果推断为大陆平台片源。证据必须包含对应作品的 TMDB 中国地区观看页；不接受任意外链或缺失来源的结果。
- 每条平台结果记录 TMDB / JustWatch 来源、上游 provider IDs、CN 地区、证据 URL、查询时间和有效期。查询时间是本服务取得数据的时间，不是平台公布权益的时间；无法保证上游数据实时。
- 缓存十分钟；观察结果最多保留六小时，过期或时间无效会降级为未知并定期重新查询。资料接口失败不影响原有站内搜索、播放或直播；观看接口单独失败时仍保留已取得的影片资料。

## 验证

运行 `RES_OPTIONS='attempts:1 timeout:1' npm test -- --maxWorkers=4 --minWorkers=1`、`npm run typecheck`、`npm run lint` 和 `NEXT_TELEMETRY_DISABLED=1 npm run build`。不要同时运行 Next.js 构建和开发服务器，它们共享 `.next`。

Preview 检查未授权降级、榜单海报打开弹窗、六个平台均为未知、关闭与焦点返回、手机/平板/桌面溢出、原有点播搜索入口、`/live`、`/watch` 页面及密码认证。使用模拟榜单或资料时必须明确标记，不能声称已核实真实影片的观看状态。
