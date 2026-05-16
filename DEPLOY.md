# 部署到 Vercel

这个项目适合用 Vercel 免费部署，拿到一个可以发给朋友的 HTTPS 链接。

## 推荐方式：GitHub + Vercel

1. 把这个项目上传到一个 GitHub 仓库。
2. 打开 https://vercel.com/ 并登录。
3. 点击 `Add New...` -> `Project`。
4. 选择这个 GitHub 仓库。
5. Vercel 通常会自动识别为 Vite 项目：
   - Framework Preset: `Vite`
   - Build Command: `npm run build`
   - Output Directory: `dist`
6. 点击 `Deploy`。
7. 部署完成后，Vercel 会给一个类似 `https://xxx.vercel.app` 的链接。

## 这个项目已经包含

- `vercel.json`：Vercel 部署配置。
- `api/eastmoney/*`：东方财富/天天基金公开数据接口。
- `api/yahoo/[...path].js`：Yahoo Finance 行情代理。
- 页面底部免责声明。

## 注意

- 数据来自公开接口，仅供娱乐、学习和原型展示，不构成投资建议。
- 免费部署适合少量朋友访问；如果访问量很大，公开接口可能限流或变动。
- `http://127.0.0.1:5174/` 只是本地地址，朋友打不开；要发 `https://xxx.vercel.app` 这种公网地址。
