# 查询示例

以下示例均需先通过 `map_set_keys` 或环境变量配置对应平台 Key。

## 资产发现

```
# FOFA: 中国境内 Nginx Web 资产
map_search { "platform": "fofa", "query": "app=\"nginx\" && country=\"CN\"", "size": 50 }

# Shodan: 暴露的 RDP
map_search { "platform": "shodan", "query": "port:3389 country:CN", "size": 50 }

# Hunter: 标题含「后台」的 Web 资产
map_search { "platform": "hunter", "query": "web.title=\"后台\"", "type": "web" }

# ZoomEye: 某组件 + 中国
map_search { "platform": "zoomeye", "query": "app:\"Tomcat\" +country:\"CN\"" }

# Quake: 某网段的 80 端口
map_search { "platform": "quake", "query": "ip:\"203.0.113.0/24\" AND port:\"80\"" }
```

## 子域 / 站点测绘

```
map_search { "platform": "fofa",   "query": "domain=\"example.com\"", "fields": "ip,port,protocol,host,title,server,city" }
map_search { "platform": "hunter", "query": "domain=\"example.com\"", "type": "web" }
map_search { "platform": "shodan", "query": "hostname:example.com" }
map_search { "platform": "quake",  "query": "domain:\"example.com\"" }
```

## 单 IP 详情

```
map_ip_detail { "platform": "shodan", "ip": "1.1.1.1" }   # 含 CVE vulns
map_ip_detail { "platform": "fofa",   "ip": "1.1.1.1" }   # 端口历史
```

## 统计与配额

```
map_stats  { "platform": "fofa",   "query": "app=\"nginx\"", "fields": "title,port,country", "size": 5 }
map_stats  { "platform": "shodan", "query": "port:443 country:CN", "facets": "org,country,port" }
map_account { "platform": "fofa" }
map_account { "platform": "shodan" }
```

## 结果落盘（配合后续分析）

```
map_search { "platform": "fofa", "query": "app=\"nginx\"", "size": 100, "save": "fofa-nginx.json" }
```

## 联合搜索与子域收集

```
# 联合搜索: 所有已配置 Key 的平台并行查询同一语句, 结果按 ip:port 去重并附摘要
map_search { "platform": "all", "query": "example.com", "size": 20 }

# 自动翻页: 连续取 3 页合并 (资产清单场景)
map_search { "platform": "fofa", "query": "domain=\"example.com\"", "size": 100, "pages": 3 }

# 子域枚举: Shodan 已知子域与 A/CNAME 记录
map_dns { "domain": "example.com" }

# 批量解析: 子域 -> IP (免查询额度)
map_dns { "hostnames": "www.example.com,api.example.com,mail.example.com" }
```
