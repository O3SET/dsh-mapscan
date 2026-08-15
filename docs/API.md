# API 契约

以下端点与参数以各平台官方文档及 [projectdiscovery/uncover](https://github.com/projectdiscovery/uncover) 开源实现核对（2026-08）。

## 汇总

| 平台    | 鉴权                      | 搜索端点                                                 | 备注                                                              |
| ------- | ------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| FOFA    | `key` URL 参数            | `GET https://fofa.info/api/v1/search/all`                | 查询需标准 Base64 (`qbase64`)                                     |
| Shodan  | `key` URL 参数            | `GET https://api.shodan.io/shodan/host/search`           | 无 size 参数，客户端截断                                          |
| Hunter  | `api-key` URL 参数        | `GET https://hunter.qianxin.com/openApi/search`          | 查询需 **URL-safe** Base64 (`search`)；根域名 403 属 WAF 正常现象 |
| ZoomEye | `API-KEY` **请求头**      | `GET https://api.zoomeye.org/host/search`                | 需自定义头 → 只能走 curl 通道                                     |
| Quake   | `X-QuakeToken` **请求头** | `POST https://quake.360.net/api/v3/search/quake_service` | JSON body → 只能走 curl 通道                                      |

## FOFA

```bash
# 搜索 (fields 可自定义; full=true 查询一年外历史)
curl 'https://fofa.info/api/v1/search/all?key=K&qbase64=YXBwPSJuZ2lueCI=&fields=ip,port,title&page=1&size=20'
# 聚合统计
curl 'https://fofa.info/api/v1/search/stats?key=K&qbase64=...&fields=title,port&size=5'
# IP 详情
curl 'https://fofa.info/api/v1/host/1.1.1.1?key=K&detail=true'
# 账户
curl 'https://fofa.info/api/v1/info/my?key=K'
```

- 搜索响应：`{error, size, page, results: [[...]], consumed_fpoint, rest_fpoint}`
- 错误：`{error:true, errmsg}`（HTTP 200 也需检查 `error` 字段）

## Shodan

```bash
curl 'https://api.shodan.io/shodan/host/search?key=K&query=nginx&page=1&minify=false'
curl 'https://api.shodan.io/shodan/host/count?key=K&query=nginx&facets=org,country'
curl 'https://api.shodan.io/shodan/host/1.1.1.1?key=K&minify=false'
curl 'https://api.shodan.io/api-info?key=K'
```

- 搜索响应：`{total, matches: [{ip_str, port, transport, hostnames, http, ssl, location, data, _shodan, vulns?...}]}`
- 401 时响应体为 HTML 文本，插件会以「非 JSON 响应」报错提示

## 鹰图 Hunter

```bash
# query 先做 URL-safe Base64 (字母表 -_ , 保留 = 填充), 与 Go base64.URLEncoding 一致
curl 'https://hunter.qianxin.com/openApi/search?api-key=K&search=<b64url>&page=1&page_size=20&is_web=1'
```

- 响应：`{code:200, message, data:{total, arr:[{ip,port,domain,web_title,url,protocol,base_protocol,status_code,component,is_risk,is_web,...}], consume_quota, rest_quota}}`
- `is_web`: 1=Web 资产、2=非 Web、3=全部
- 无独立账户端点，配额由一次最小搜索读取（`ip="8.8.8.8"`, `page_size=1`）

## ZoomEye

```bash
curl -H 'API-KEY: K' 'https://api.zoomeye.org/host/search?query=app:%22nginx%22&page=1'
curl -H 'API-KEY: K' 'https://api.zoomeye.org/resources-info'
```

- 响应：`{total, matches: [{ip, portinfo:{port,service,app,banner,hostname,os}, geoinfo:{...}, timestamp}]}`
- 无效 Key 返回 401 + `{"code":"login_required", ...}`

## Quake

```bash
curl -X POST \
  -H 'X-QuakeToken: K' -H 'Content-Type: application/json' \
  -d '{"query":"port:\"80\"","start":0,"size":20,"ignore_cache":true}' \
  'https://quake.360.net/api/v3/search/quake_service'
curl -H 'X-QuakeToken: K' 'https://quake.360.net/api/v3/user/info'
```

- 搜索响应：`{code:0, message, data:[{ip,port,hostname,service,os_name,components,location,asn,org,time}], meta:{pagination:{count,total,page_index,page_size}}}`
- `code !== 0` 视为业务错误
- 无效 Token 返回 401，body 为 `/quake/login`（非 JSON，插件报「非 JSON 响应」）
