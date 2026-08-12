# iLabel++ React 前端

基于产品参考资料重新实现的 React + TypeScript 前端。当前范围包含登录页、统一应用框架、工作台、项目管理、标签管理、团队与成员及 VLA 视频标注工作台。`VLA数据标注平台` 目录仅作为只读产品与接口参考，不属于本前端源码。

## 本地启动

```bash
npm install
npm run dev
```

打开终端显示的地址，默认进入 `#/login`。当前只启用真实 API 模式，登录后使用 Django session cookie 访问后续接口。

## 连接真实 API

开发服务器会将同源 `/api` 请求代理到 `http://120.55.50.203:18080`，避免浏览器跨域和 session cookie 域不一致。可直接执行：

```bash
npm run dev:real
```

需要更换地址时修改 `.env` 和 `.env.real` 中的代理目标：

```dotenv
VITE_API_MODE=real
VITE_API_BASE_URL=
VITE_PROXY_TARGET=http://120.55.50.203:18080
```

页面通过 `src/services` 下的请求模块访问后端。Mock 启动脚本和环境入口已关闭；仓库内保留的 mock 数据只作为历史开发夹具，不会被当前环境加载。

## 检查与构建

```bash
npm run lint
npm run build
npm run build:real
```

实际后端接口契约以根目录 [backend-api.md](backend-api.md) 为准。`docs/frontend-api-contract.md` 是后端定稿前的历史前端草案，不应再用于实现接口。
