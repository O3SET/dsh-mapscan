# 各平台检索语法速查

`map_search` 的 `query` 参数使用**各平台原生语法**（直接透传），下表为常用语法速查。

## FOFA

| 语法                                                     | 说明               |
| -------------------------------------------------------- | ------------------ |
| `app="nginx"`                                            | 组件指纹           |
| `domain="example.com"`                                   | 域名               |
| `host=".example.com"`                                    | 主机名（子域后缀） |
| `ip="1.1.1.1/24"`                                        | IP / CIDR          |
| `port="443"`                                             | 端口               |
| `protocol="https"`                                       | 协议               |
| `title="后台"` / `body="关键字"` / `header="xxx"`        | 页面内容指纹       |
| `cert="org名"`                                           | 证书               |
| `icon_hash="-247388890"`                                 | favicon 哈希       |
| `country="CN"` / `region="Zhejiang"` / `city="Hangzhou"` | 地理               |
| `server="nginx"`                                         | Web 服务器         |
| `os="Linux"`                                             | 操作系统           |

逻辑：`&&`（与）、`||`（或）、`()`（分组）、`=`（排除，如 `port!="443"`）。

## Shodan

| 语法                                     | 说明                  |
| ---------------------------------------- | --------------------- |
| `nginx`                                  | 关键词（banner 全文） |
| `port:443`                               | 端口                  |
| `country:CN` / `city:"Beijing"`          | 地理                  |
| `org:"Google"` / `isp:"China Telecom"`   | 组织 / ISP            |
| `net:1.1.1.0/24`                         | 网段                  |
| `product:"Apache"` / `version:2.4`       | 产品 / 版本           |
| `os:"Linux"`                             | 操作系统              |
| `hostname:example.com`                   | 主机名                |
| `http.title:"login"` / `http.status:200` | HTTP 属性             |
| `ssl.cert.subject.cn:"example.com"`      | 证书 CN               |
| `vuln:CVE-2021-44228`                    | 漏洞编号              |

空格分隔即 AND；`-` 前缀排除，如 `-org:"Google"`。

## 鹰图 Hunter

| 语法                   | 说明       |
| ---------------------- | ---------- |
| `ip="1.1.1.1"`         | IP         |
| `domain="example.com"` | 域名       |
| `web.title="后台"`     | 网页标题   |
| `web.body="关键字"`    | 网页正文   |
| `app="Tomcat"`         | 组件       |
| `port="8080"`          | 端口       |
| `protocol="https"`     | 协议       |
| `header="xxx"`         | HTTP 头    |
| `icp="京ICP备"`        | ICP 备案号 |
| `is_domain=true`       | 仅域名资产 |
| `company="公司名"`     | 所属单位   |

逻辑：`&&`、`||`、`()`。另可配合工具参数 `type`(web/nonweb/all)、`status_code`、`start_time`/`end_time` 过滤。

## ZoomEye

| 语法                              | 说明      |
| --------------------------------- | --------- |
| `app:"nginx"`                     | 组件      |
| `site:example.com`                | 站点      |
| `ip:1.1.1.1` / `cidr:1.1.1.0/24`  | IP / 网段 |
| `port:443`                        | 端口      |
| `service:"http"`                  | 服务      |
| `country:"CN"` / `city:"beijing"` | 地理      |
| `os:"linux"`                      | 操作系统  |
| `title:"后台"`                    | 标题      |

逻辑：`+` 为 AND，空格为 OR。

## Quake

| 语法                                               | 说明      |
| -------------------------------------------------- | --------- |
| `ip:"1.1.1.1"` / `ip:"1.1.1.0/24"`                 | IP / 网段 |
| `domain:"example.com"`                             | 域名      |
| `port:"80"`                                        | 端口      |
| `service:"http"`                                   | 服务      |
| `app:"nginx"`                                      | 组件      |
| `title:"xxx"`                                      | 标题      |
| `country:"CN"` / `province:"浙江"` / `city:"杭州"` | 地理      |
| `os:"Linux"`                                       | 操作系统  |
| `cert:"xxx"`                                       | 证书      |

逻辑：`AND`、`OR`、`NOT`、`()`。
