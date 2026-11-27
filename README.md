# iLabel++ React 前端

基于产品参考资料重新实现的 React + TypeScript 前端。当前范围包含登录页、统一应用框架、工作台、项目管理、标签管理、团队与成员及 VLA 视频标注工作台。`VLA数据标注平台` 目录仅作为只读产品与接口参考，不属于本前端源码。

## 本地启动

```bash
npm install
npm run dev
```

打开终端显示的地址，默认进入 `#/login`。当前只启用真实 API 模式，登录后使用 Django session cookie 访问后续接口。

## 连接真实 API

开发服务器会将同源 `/api` 请求代理到 `http://47.108.78.62:18081`，避免浏览器跨域和 session cookie 域不一致。可直接执行：

```bash
npm run dev:real
```

需要更换地址时修改 `.env` 和 `.env.real` 中的代理目标：

```dotenv
VITE_API_MODE=real
VITE_API_BASE_URL=
VITE_PROXY_TARGET=http://47.108.78.62:18081
```

页面通过 `src/services` 下的请求模块访问后端。Mock 启动脚本和环境入口已关闭；仓库内保留的 mock 数据只作为历史开发夹具，不会被当前环境加载。

## 检查与构建

```bash
npm run lint
npm run build
npm run build:real
```

实际后端接口契约以根目录 [backend-api.md](backend-api.md) 为准。`docs/frontend-api-contract.md` 是后端定稿前的历史前端草案，不应再用于实现接口。

## 生产项目与数据集

项目管理采用「生产项目 Product → 数据集 Project → 视频 TaskVideo」三级结构。`#/products` 管理生产项目，进入 `#/products/{productId}/datasets` 管理旗下数据集，视频列表及标注仍使用原 `/projects/{projectId}/...` 页面和 API。

生产项目通过 `/api/products/` 配置团队、负责人、标签库、对象库和交付时间；数据集创建带 `product_id`，配置只能选所属生产项目的关联项，交付日期不能晚于生产项目。生产项目状态不自动级联数据集。

上线前需由后端创建首个生产项目，并执行文档中的 `python manage.py attach_legacy_projects --product-id <ID>` 迁移历史数据集；前端不自动挂载或更改历史数据归属。

### 数据复制

数据列表的“更多操作 → 复制”和“批量复制”共用复制弹窗，批量沿用跨页勾选。管理员可选可见生产项目，项目经理按负责人查询管理的生产项目；目标数据集沿用项目下可见列表，仅未启动、进行中允许接收。

复制调用 `POST /api/projects/{target_project_id}/videos/copy`，每批最多 200 条，串行提交。逐条成功项不会因部分失败而重试；请求结果不明时停止后续批次并提示检查目标数据集。`copy_annotation` 复制最新已提交标注，`run_pre_annotation` 仅对原始数据复制生效。

当前接口未提供重复检查、跳过重复项和“副本N”文件命名参数，这部分尚未实现，需补充后端协议；前端不发送推测的重复处理字段。接口来源字段 `is_copy`、`source_video_id`、`source_fleet_video_id`、`copy_reason`、`copied_at` 用于副本展示。

### 数据列表页签与筛选

视频列表按全部、AI 预处理、人工作业、AI 描述、视频切分、已完成、已作废、异常排列，列及筛选由 `src/utils/projectVideoList.ts` 定义。异常查询使用 `stage_status=failed`，再限制为三个机器阶段，不再强制 `stage=pre_annotation`。作业节点、作业状态仅在人工作业阶段显示；流转类型采用列表返回的 `work_type`，预作废徽标独立展示。

列表接口支持的条件直接服务端分页；ID 模糊查询、作业节点、更新时间（北京时间自然日）、多选 OR 条件以及严格的“未设样例”（存在无效区间且无样例）会先按服务端可用条件缩小范围，再分页读取全部候选记录统一过滤和分页。读取中显示进度，切换查询会停止后续读取；结果快照缓存到本页实例，刷新或操作后失效。未实现只筛当前页，也不发送后端会忽略的猜测参数；大量数据场景建议后端补充对应筛选及人员候选接口。

三个机器环节最近一轮状态分别读取并查询 `pre_annotation_status`、`model_description_status`、`cutting_status`；各机器阶段页签提供对应的执行状态筛选。全部页签不展示三个机器执行状态、无效原因和样例状态筛选。异常页签仅新增处理阶段筛选，组合 `stage_status=failed` 与可选 `stage`，不展示执行状态、无效原因和样例状态筛选；视频切分页签不展示无效原因和样例状态筛选；已完成页签不展示三个机器执行状态筛选。空值显示 `-`，仅旧响应未提供新字段时回退到当前阶段的 `stage_status`。列表未返回 `atomic_task_count` / `atomic_action_count` 时对应统计显示 `-`，不假设为零。后端 `work_type` 是当前返修口径，不是历史发生过退回；页面沿用接口口径。

已有查看、人工处理、完成后无效区间修订、复制、AI 预处理重试、作废及释放接口已接入。释放使用 `POST /api/projects/{project_id}/videos/{video_id}/release`，在人工作业的已分配数据“更多操作”中提供，二次确认后执行并刷新列表。删除使用 `DELETE /api/projects/{project_id}/videos/{video_id}`，有管理权限时，各页签每条数据均提供删除入口，不按阶段或执行状态在前端限制，由后端判断是否可删除，失败时展示接口错误，确认成功后移除勾选并刷新列表。分配、分配返修、重新生成、重新切割及机器阶段人工修改缺少本次交接协议，相应条件下显示禁用入口并说明原因，未发送推测的写接口。
