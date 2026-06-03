# SMS.MineApi 1Panel / 宝塔部署指南

这份文档用于把 SMS.MineApi 部署到 Linux 服务器，并通过 1Panel 或宝塔面板绑定域名、开启 HTTPS。

SMS.MineApi 是 Node.js + Express + SQLite 项目，默认监听端口为 `7060`，生产环境建议通过面板反向代理到 `127.0.0.1:7060`。

## 部署前准备

- 一台 Linux 服务器，推荐 Ubuntu 22.04 / Debian 12 / CentOS 7+。
- 一个已经解析到服务器 IP 的域名，例如 `sms.example.com`。
- Node.js 18 或 20。
- 项目源码，例如上传到 `/opt/sms-mineapi`。

生产环境必须修改：

- `.env` 里的 `SESSION_SECRET`
- `.env` 里的 `ADMIN_PASSWORD`
- 后台设置里的管理员密码

不要把真实短信 API 链接、真实手机号、生产数据库提交到公开仓库。

## 一、1Panel 部署

### 1. 安装运行环境

在 1Panel 应用商店安装：

- OpenResty
- Node.js 运行环境

### 2. 上传项目

推荐目录：

```bash
/opt/sms-mineapi
```

可以通过 1Panel 文件管理上传项目，也可以在服务器终端执行：

```bash
cd /opt
git clone https://github.com/buperminier-netizen/sms.mineapi.git sms-mineapi
cd sms-mineapi
```

如果你的仓库地址不同，请替换成自己的 GitHub 地址。

### 3. 配置环境变量

在项目根目录创建 `.env`：

```env
PORT=7060
DATABASE_PATH=./data/sms-mineapi.sqlite
SESSION_SECRET=replace-with-a-long-random-string
ADMIN_PASSWORD=change-this-admin-password
DEFAULT_DURATION_DAYS=25
SMS_FETCH_TIMEOUT_MS=10000
AUTO_REFRESH_SECONDS=10
```

建议把 `SESSION_SECRET` 改成 32 位以上随机字符串。

### 4. 安装依赖

```bash
cd /opt/sms-mineapi
npm ci --omit=dev
```

如果是第一次部署，并且需要初始化演示数据：

```bash
npm run demo:init
```

正式运营前可以在后台删除演示卡密，再创建真实卡密。

### 5. 创建 Node.js 运行环境

在 1Panel 中进入：

```txt
网站 -> 运行环境 -> Node.js -> 创建运行环境
```

推荐配置：

| 配置项 | 填写内容 |
| --- | --- |
| 运行目录 | `/opt/sms-mineapi` |
| 启动命令 | `npm start` |
| 运行端口 | `7060` |
| Node 版本 | `18` 或 `20` |

启动后，先确认服务可以访问：

```txt
http://服务器IP:7060
```

如果服务器安全组或防火墙没有开放 `7060`，公网可能无法直接访问，但反向代理仍然可以使用 `127.0.0.1:7060`。

### 6. 创建网站并反向代理

在 1Panel 中进入：

```txt
网站 -> 网站 -> 创建网站
```

如果选择反向代理方式：

| 配置项 | 填写内容 |
| --- | --- |
| 主域名 | `sms.example.com` |
| 代理地址 | `http://127.0.0.1:7060` |

创建完成后进入网站设置，申请 SSL 证书并开启 HTTPS。

### 7. 访问地址

```txt
前台：https://sms.example.com/
后台：https://sms.example.com/admin.html
```

## 二、宝塔面板部署

宝塔推荐使用 PM2 管理器或 Node 项目管理器运行 SMS.MineApi，再通过网站反向代理绑定域名。

### 1. 安装基础软件

在宝塔软件商店安装：

- Nginx
- Node.js 版本管理器 / Node 项目管理器
- PM2 管理器

Node.js 推荐选择 18 或 20。

### 2. 上传项目

推荐目录：

```bash
/www/wwwroot/sms-mineapi
```

可以通过宝塔文件管理上传项目，也可以在服务器终端执行：

```bash
cd /www/wwwroot
git clone https://github.com/buperminier-netizen/sms.mineapi.git sms-mineapi
cd sms-mineapi
```

### 3. 创建 `.env`

在 `/www/wwwroot/sms-mineapi/.env` 写入：

```env
PORT=7060
DATABASE_PATH=./data/sms-mineapi.sqlite
SESSION_SECRET=replace-with-a-long-random-string
ADMIN_PASSWORD=change-this-admin-password
DEFAULT_DURATION_DAYS=25
SMS_FETCH_TIMEOUT_MS=10000
AUTO_REFRESH_SECONDS=10
```

### 4. 安装依赖并初始化

```bash
cd /www/wwwroot/sms-mineapi
npm ci --omit=dev
npm run demo:init
```

如果已经有正式数据库，不要重复执行 `npm run demo:init` 覆盖或重置数据。

### 5. 使用 PM2 启动

在宝塔 PM2 管理器中添加项目：

| 配置项 | 填写内容 |
| --- | --- |
| 项目目录 | `/www/wwwroot/sms-mineapi` |
| 启动文件 | `src/server.js` |
| 项目名称 | `sms-mineapi` |
| 运行用户 | `www` 或 `root` |

也可以在服务器终端执行：

```bash
cd /www/wwwroot/sms-mineapi
pm2 start src/server.js --name sms-mineapi
pm2 save
```

确认服务运行：

```bash
pm2 status
```

### 6. 创建网站并配置反向代理

在宝塔中创建站点：

```txt
网站 -> 添加站点
```

域名填写：

```txt
sms.example.com
```

然后进入站点设置：

```txt
反向代理 -> 添加反向代理
```

配置：

| 配置项 | 填写内容 |
| --- | --- |
| 代理名称 | `sms-mineapi` |
| 目标 URL | `http://127.0.0.1:7060` |
| 发送域名 | `$host` |

保存后，进入 SSL 面板申请证书并开启 HTTPS。

### 7. 访问地址

```txt
前台：https://sms.example.com/
后台：https://sms.example.com/admin.html
```

## 三、常见问题

### 1. better-sqlite3 安装失败

`better-sqlite3` 可能需要编译环境。根据系统安装编译工具：

Ubuntu / Debian：

```bash
apt update
apt install -y build-essential python3 make g++
```

CentOS：

```bash
yum groupinstall -y "Development Tools"
yum install -y python3 make gcc gcc-c++
```

然后重新安装依赖：

```bash
npm ci --omit=dev
```

### 2. 页面打不开

依次检查：

- Node 服务是否启动。
- 项目是否监听 `7060` 端口。
- 反向代理目标是否为 `http://127.0.0.1:7060`。
- 域名是否解析到服务器 IP。
- 服务器防火墙和云服务器安全组是否允许 `80`、`443`。

### 3. 后台登录失败

检查：

- `.env` 中的 `ADMIN_PASSWORD`。
- 后台设置中是否已经修改过管理员密码。
- `.env` 中的 `SESSION_SECRET` 是否为空或频繁变化。

如果数据库里已经保存过后台密码，系统会优先使用数据库中的密码，`.env` 里的 `ADMIN_PASSWORD` 只作为初始兜底。

### 4. 验证码无法刷新

检查：

- 卡密绑定的上游短信 API 链接是否可访问。
- 服务器是否能访问上游 API。
- 上游返回内容里是否包含验证码。
- `.env` 中 `SMS_FETCH_TIMEOUT_MS` 是否过短。

### 5. 数据如何备份

核心数据在：

```txt
data/sms-mineapi.sqlite
```

建议定期备份整个项目目录，至少备份：

```txt
data/
.env
```

SQLite 运行时可能出现：

```txt
sms-mineapi.sqlite-wal
sms-mineapi.sqlite-shm
```

这是正常文件，备份时建议先停止服务，或把这两个文件一起备份。

## 四、生产环境建议

- 使用 HTTPS。
- 修改默认管理员密码。
- 修改 `SESSION_SECRET`。
- 不要开放真实上游 API 链接。
- 定期备份 `data/`。
- 后台地址 `/admin.html` 建议配合面板访问限制、IP 白名单或额外鉴权。
- 正式运营前删除演示卡密 `TEST-OPEN-ARTIVIS`。
