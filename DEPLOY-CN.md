# 更适合中国大陆访问的部署方案

如果这个站只是发给身边朋友玩，最省心、访问也相对更稳的做法是：

`GitHub + 腾讯云 Lighthouse 香港节点 + PM2 + Nginx`

这样有几个好处：

- 比 `*.vercel.app` 更适合中国大陆访问
- 不需要做复杂的云函数拆分
- 你现在这套 `/api/...` 数据接口可以直接继续用
- 朋友打开的是你自己的公网域名或服务器 IP

## 推荐机器

- 地区：`中国香港`
- 配置：`2C2G` 就够试玩
- 系统：`Ubuntu 22.04 LTS`

如果以后只是几十个朋友偶尔点开，这个配置已经够了。

## 项目已经准备好的内容

仓库里现在同时支持两种部署：

- `Vercel` 版本：保留现状
- `香港服务器` 版本：新增 `npm start`

关键文件：

- `server/http.js`：Node 服务端入口
- `server/eastmoney.js`：东方财富 / 天天基金公开数据聚合
- `ecosystem.config.cjs`：PM2 进程配置

## 服务器部署步骤

### 1. 登录服务器

```bash
ssh root@你的服务器IP
```

### 2. 安装 Node.js 20 和 Nginx

```bash
apt update
apt install -y curl git nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g pm2
```

### 3. 拉代码

```bash
cd /var/www
git clone https://github.com/Kirsi77/market-sentiment-dashboard.git
cd market-sentiment-dashboard
```

### 4. 安装依赖并构建

```bash
npm install
npm run build
```

### 5. 启动 Node 服务

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

### 6. 配置 Nginx 反向代理

新建：

```bash
nano /etc/nginx/sites-available/market-sentiment-dashboard
```

填入：

```nginx
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用并重载：

```bash
ln -s /etc/nginx/sites-available/market-sentiment-dashboard /etc/nginx/sites-enabled/market-sentiment-dashboard
nginx -t
systemctl reload nginx
```

## 绑定域名

如果你只是发朋友玩，其实直接发服务器 IP 也能用。

如果想更像一个正式网址，推荐：

- 在腾讯云或阿里云买一个便宜域名
- 把 `A 记录` 指向这台香港服务器 IP

然后把上面的 Nginx 里的：

```nginx
server_name _;
```

改成你的域名，比如：

```nginx
server_name market.yourdomain.com;
```

## HTTPS

如果用了自己的域名，可以继续装证书：

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d 你的域名
```

这样朋友打开就是 `https://...`

## 搜索引擎可见性

如果你只是转发给朋友，通常不需要被搜索引擎搜到。

只要把链接发给别人，他们就能访问。

如果以后想让别人通过搜索找到，还要额外做这些事：

- 用自定义域名
- 保持站点长期在线
- 提交到百度搜索资源平台
- 提交到 Google Search Console

## 重要提醒

这个项目现在用的是东方财富 / 天天基金公开接口，适合：

- 学习
- 原型展示
- 小范围朋友访问

不适合：

- 商业化
- 高并发
- 对稳定性要求特别高的正式产品

建议页面保留这句免责声明：

`数据来自公开接口，仅供娱乐、学习和原型展示，不构成投资建议。`
