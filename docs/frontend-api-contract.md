# iLabel++ 前端接口契约

版本：`v1.0-draft`  
范围：登录、会话、工作台、项目管理、标签管理、团队与成员  
默认 API 地址：`http://127.0.0.1:4180`

## 通用约定

- 编码：UTF-8，数据格式：`application/json`。
- 认证：服务端通过 HttpOnly Session Cookie 维护登录态，前端请求统一携带 `credentials: include`。
- 写请求：登录成功后服务端返回 `csrfToken`；后续写请求通过 `X-CSRF-Token` 请求头提交。
- 成功响应建议统一为 `{ "success": true, "data": ... }`。
- 失败响应建议统一为 `{ "success": false, "code": "ERROR_CODE", "message": "可展示的错误信息" }`。
- 时间字段使用 `YYYY-MM-DD HH:mm:ss`，时区为 `Asia/Shanghai`。
- 项目是数据隔离边界，服务端必须根据当前 Session 重新校验 `projectId`，不能信任前端传值。

## 1. 密码登录

`POST /api/auth/login`

请求：

```json
{
  "username": "zhanghaitao",
  "password": "******",
  "takeover": false
}
```

响应 `200`：

```json
{
  "success": true,
  "data": {
    "account": {
      "id": "U-LABELER-01",
      "account": "zhanghaitao",
      "displayName": "张海涛",
      "roleIds": ["annotator", "project-manager"],
      "roleLabels": ["标注员", "项目经理"]
    },
    "csrfToken": "server-generated-token",
    "defaultRoute": "/workbench"
  }
}
```

常见错误：`400 INVALID_ARGUMENT`、`401 INVALID_CREDENTIALS`、`409 ACCOUNT_SESSION_ACTIVE`、`429 LOGIN_RATE_LIMITED`。

## 2. 短信登录

### 2.1 请求验证码

`POST /api/auth/sms-code/request`

```json
{ "phone": "13800000000" }
```

```json
{ "success": true, "data": { "challengeId": "challenge-id", "expiresIn": 300 } }
```

### 2.2 校验验证码

`POST /api/auth/sms-login/verify`

```json
{ "phone": "13800000000", "code": "123456", "challengeId": "challenge-id" }
```

```json
{
  "success": true,
  "data": {
    "loginTicket": "short-lived-ticket",
    "candidates": [{ "accountId": "U-LABELER-01", "maskedAccount": "zhang***", "scopeLabel": "清华路端项目团队" }]
  }
}
```

### 2.3 完成登录

`POST /api/auth/sms-login/complete`

```json
{ "loginTicket": "short-lived-ticket", "accountId": "U-LABELER-01", "takeover": false }
```

响应结构与密码登录一致。

## 3. 找回密码

### 3.1 发起验证

`POST /api/auth/password-reset/request`

```json
{ "account": "zhanghaitao" }
```

```json
{ "success": true, "data": { "resetToken": "short-lived-reset-token", "maskedPhone": "188****0003" } }
```

### 3.2 确认重置

`POST /api/auth/password-reset/confirm`

```json
{ "resetToken": "short-lived-reset-token", "code": "123456", "newPassword": "new-password" }
```

```json
{ "success": true, "data": { "changed": true } }
```

## 4. 会话

### 获取当前会话

`GET /api/session/context`

响应包含 `account`、`roleIds`、`roleLabels`、`visibleMenus`、`workNodes`、`dataScope` 和 `defaultRoute`。

### 退出登录

`POST /api/auth/logout`

服务端撤销 Session、清理 Cookie，并返回 `{ "success": true, "data": { "loggedOut": true } }`。

## 5. 项目列表

`GET /api/data/projects`

```json
{
  "success": true,
  "data": {
    "items": [{
      "projectId": "1",
      "projectCode": "PRJ-QH-ROAD",
      "projectName": "清华路端项目",
      "description": "第一批次 · 路口行为采集",
      "status": "running",
      "pendingCount": 6,
      "claimLimit": 10
    }]
  }
}
```

## 6. 工作台任务

`GET /api/workbench/tasks`

查询参数：

| 参数 | 必填 | 说明 |
|---|---:|---|
| `projectId` | 是 | 当前授权项目 ID |
| `tab` | 是 | `pending` 或 `submitted` |
| `keyword` | 否 | 数据名称或数据 ID |
| `taskNode` | 否 | `annotation/review/quality/acceptance` |
| `pageNo` | 否 | 默认 1 |
| `pageSize` | 否 | 默认 10 |

响应：

```json
{
  "success": true,
  "data": {
    "items": [{
      "id": "TASK-20260806-018",
      "dataId": "DATA-QH-018",
      "dataName": "roadside_obstacle_018",
      "node": "annotation",
      "workType": "returned",
      "status": "processing",
      "totalDuration": 184,
      "selectedDuration": 146,
      "validDuration": 132,
      "invalidDuration": 14,
      "unselectedDuration": 38,
      "goalCount": 12,
      "actionCount": 36,
      "startedAt": "2026-08-06 09:18:00",
      "updatedAt": "2026-08-06 10:42:00",
      "durationText": "1小时24分",
      "assignee": "张海涛"
    }],
    "page": { "pageNo": 1, "pageSize": 10, "total": 6 },
    "viewMode": "personal",
    "selfClaimEnabled": true
  }
}
```

## 7. 待领取任务池

`GET /api/workbench/claim-pool?projectId=1`

```json
{
  "success": true,
  "data": {
    "items": [
      { "node": "annotation", "label": "标注数据", "count": 18 },
      { "node": "review", "label": "质检数据", "count": 7 },
      { "node": "quality", "label": "审核数据", "count": 4 },
      { "node": "acceptance", "label": "验收数据", "count": 2 }
    ],
    "selfClaimEnabled": true
  }
}
```

## 8. 随机领取任务

`POST /api/workbench/tasks/claim`

```json
{ "projectId": "1", "taskNode": "annotation" }
```

成功时返回完整任务对象。服务端需校验项目状态、用户角色、项目授权、培训状态及同账号跨节点待处理/处理中总数不超过 10 条。

常见错误：`403 PROJECT_ACCESS_DENIED`、`409 CLAIM_LIMIT_REACHED`、`409 NO_CLAIMABLE_TASK`、`423 PROJECT_NOT_RUNNING`。

## 9. 项目管理

### 9.1 项目列表

`GET /api/data/projects`

响应 `data.items` 中每个项目字段如下：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` / `projectId` | string | 项目主键，响应至少返回其中一个 |
| `code` / `projectCode` | string | 不可变项目编号 |
| `name` / `projectName` | string | 项目名称 |
| `status` | string | `not-started/running/paused/finished/archived` |
| `teams` | string[] | 关联团队名称 |
| `memberCount`, `dataCount` | number | 标注人数、数据量 |
| `selectedDuration`, `validDuration`, `invalidDuration`, `unselectedDuration` | number | 秒 |
| `goalCount`, `actionCount` | number | 单次任务数、小目标数 |
| `completionNode` | string | `质检/审核/验收` |
| `progress` | number | 0 至 100 |
| `owner` | string | 项目负责人显示名 |
| `createdAt`, `deliveryAt` | string | 创建和交付时间 |
| `labelLibraryIds` | string[] | 项目绑定的标签库 |

### 9.2 创建或编辑项目

`POST /api/data/projects/save`

```json
{
  "mode": "create",
  "projectId": null,
  "name": "园区夜间采集项目",
  "desc": "夜间复杂光照场景",
  "teams": ["视频动作专项组"],
  "owner": "赵敏",
  "deliveryAt": "2026-09-15",
  "completionNode": "验收",
  "assignmentStrategy": "manual_claim",
  "labelLibraryIds": ["1", "3"]
}
```

`mode` 为 `create/edit`。`assignmentStrategy` 为 `manual_claim/load_balance/even_distribution`。响应返回更新后的 `{ "items": [...] }`。

项目状态变更仍调用此接口，`mode` 为 `edit`，提交完整的可编辑项目字段并增加目标 `status`。允许的迁移为：未启动→进行中、进行中→暂停/结束、暂停→进行中/结束、结束→归档。

### 9.3 删除项目

`POST /api/data/projects/delete`

```json
{ "projectId": "4" }
```

仅未启动且没有数据、任务或作业快照的项目允许删除。当前前端暂未开放删除入口，但保留该契约。

## 10. 标签管理

### 10.1 标签库列表

`GET /api/data/label-libraries`

```json
{
  "success": true,
  "data": {
    "items": [{
      "id": "1",
      "code": "LIB-ROAD-V2",
      "name": "道路参与者标签库",
      "desc": "道路交通参与者与基础设施标签",
      "enabled": true,
      "createdAt": "2026-05-18 10:24:00",
      "count": 2,
      "tags": [{
        "id": "101", "code": "car", "name": "车辆", "color": "#2F80ED",
        "appliesTo": "goal", "enabled": true, "createdAt": "2026-05-18 10:28:00"
      }]
    }]
  }
}
```

`appliesTo` 为 `goal/action/both`，分别表示单次任务、小目标、两者。颜色必须是 `#RRGGBB`。

### 10.2 标签库写接口

| 方法与路径 | 请求体 | 说明 |
|---|---|---|
| `POST /api/data/label-libraries/save` | `{ "id"?: string, "name": string, "desc": string }` | 新建或编辑标签库 |
| `POST /api/data/label-libraries/delete` | `{ "labelLibraryId": string }` | 删除未被项目引用的标签库 |
| `POST /api/data/label-libraries/labels/save` | `{ "labelLibraryId": string, "id"?: string, "name": string, "color": string, "appliesTo": string }` | 新建或编辑标签 |
| `POST /api/data/label-libraries/labels/delete` | `{ "labelLibraryId": string, "labelIds": string[] }` | 批量删除标签 |
| `POST /api/data/label-libraries/labels/import` | `{ "labelLibraryId": string, "rows": object[], "preview"?: boolean }` | 预检或导入标签 |
| `POST /api/data/label-libraries/labels/export` | `{ "labelLibraryId": string, "labelIds"?: string[] }` | 导出标签 |

CRUD 写接口响应均返回更新后的 `{ "items": LabelLibrary[] }`。已进入项目任务快照的标签不可物理删除，服务端应返回 `409 LABEL_IN_USE`。

## 11. 团队与成员

### 11.1 页面聚合数据

`GET /api/data/team-members`

```json
{
  "success": true,
  "data": {
    "teams": [{ "id": "1", "name": "清华路端项目团队", "desc": "负责路端视频片段标注", "enabled": true, "memberCount": 4 }],
    "members": [{
      "accountId": "3", "account": "zhanghaitao", "name": "张海涛",
      "phone": "18800020003", "team": "清华路端项目团队",
      "roles": ["项目经理", "标注员"], "projects": ["清华路端项目"],
      "enabled": true, "joinedAt": "2026-05-18"
    }],
    "projects": [{
      "projectId": "1", "projectName": "清华路端项目", "memberCount": 4,
      "managerCount": 2, "annotatorCount": 1, "reviewerCount": 1,
      "qualityCount": 1, "acceptorCount": 0, "teams": ["清华路端项目团队"]
    }]
  }
}
```

### 11.2 团队写接口

| 方法与路径 | 请求体 | 说明 |
|---|---|---|
| `POST /api/data/team-members/teams/save` | `{ "id"?: string, "name": string, "desc": string, "enabled": boolean }` | 新建或编辑团队 |
| `POST /api/data/team-members/teams/delete` | `{ "teamId": string }` | 停用团队，保留历史关系 |
| `POST /api/data/team-members/teams/restore` | `{ "teamId": string }` | 恢复团队 |

### 11.3 成员写接口

| 方法与路径 | 请求体 | 说明 |
|---|---|---|
| `POST /api/data/team-members/members/save` | `{ "accountId"?: string, "account": string, "name": string, "phone": string, "password"?: string, "team": string, "roles": string[] }` | 添加或编辑成员，新建时密码必填 |
| `POST /api/data/team-members/members/status` | `{ "accountId": string, "enabled": boolean }` | 启停成员 |
| `POST /api/data/team-members/members/move-batch` | `{ "accountIds": string[], "teamId": string }` | 批量移动团队 |
| `POST /api/data/team-members/members/password` | `{ "accountId": string, "newPassword": string }` | 管理员重置密码 |
| `POST /api/data/team-members/import` | `{ "rows": object[], "preview"?: boolean }` | 成员导入预检/提交 |
| `POST /api/data/team-members/import-template` | `{}` | 获取导入模板 |
| `POST /api/data/team-members/export` | `{ "teamId"?: string, "accountIds"?: string[] }` | 导出当前范围成员 |

所有团队和成员写接口返回与 `GET /api/data/team-members` 相同的聚合 `data`，便于前端原子刷新页面。

## 12. 权限与隔离

- 项目管理写操作仅管理员、项目经理可用；项目经理只能操作自己管理范围内的项目。
- 标签库是系统共享配置，仅管理员可写；普通用户只读。项目只能绑定启用的标签库。
- 团队、账号、角色、启停和密码操作仅管理员可用。最后一个启用管理员不可被停用。
- 服务端必须从 Session 获取操作者身份，忽略请求体伪造的 `accountId` 或权限字段。
- 列表、成员项目分布和写操作均按操作者数据范围过滤；任何 `projectId/teamId/accountId` 都需重新鉴权。
- 业务冲突使用 `409`，权限不足使用 `403`，资源不存在或不可见统一使用 `404`。

## 13. VLA 视频标注工作台

### 13.1 开始处理任务

`POST /api/workbench/tasks/{taskId}/start`

仅待处理任务首次进入编辑操作台前调用。服务端需原子校验任务归属、当前节点角色、项目状态及占用状态，并将任务置为处理中。继续处理和只读查看不重复调用。

### 13.2 获取操作台工作区

`GET /api/operation/tasks/{taskId}/workspace`

```json
{
  "success": true,
  "data": {
    "context": {
      "taskId": "TASK-20260806-018",
      "taskCode": "TASK-20260806-018",
      "dataId": "DATA-QH-018",
      "dataName": "roadside_obstacle_018",
      "projectId": "1",
      "projectName": "清华路端项目",
      "workflowStage": "annotation",
      "frameRate": 30,
      "durationSeconds": 30.366667,
      "videoUrl": "https://signed-object-url/video.mp4",
      "policy": { "canSave": true, "canSubmit": true }
    },
    "document": {
      "currentRevision": 3,
      "resultManifest": {
        "schemaVersion": "vla-video-hierarchy@11.0.0",
        "coordinateSystem": "zero-based-frame",
        "intervalConvention": "half-open",
        "frameRate": 30,
        "totalFrames": 911,
        "goals": [],
        "actions": [],
        "invalidRanges": [],
        "usedAnnotationConfigCodes": [],
        "comments": [],
        "nextGoalSequence": 1,
        "nextActionSequenceByGoal": {}
      }
    },
    "labels": []
  }
}
```

真实部署也可以不直接返回 `videoUrl`，改为返回对象存储键并通过签名下载接口换取短期 URL。前端 Mock 固定使用 `/temp.mp4`。

### 13.3 标注结果模型

所有区间以从 `F0` 开始的整数帧边界保存，采用 `[startFrame, endFrame)` 左闭右开语义。秒数仅用于前端展示。

```json
{
  "id": "goal-uuid",
  "type": "goal",
  "startFrame": 60,
  "endFrame": 300,
  "labelId": "201",
  "labelName": "通过路口",
  "color": "#2563EB",
  "descriptionZh": "车辆通过园区路口",
  "descriptionEn": ""
}
```

小目标增加 `parentId`，`type` 为 `action` 或系统固定的 `no_action`。片段同时保存不可复用的 `sequence/code`。同级区间不可重叠，小目标必须完全包含在父级单次任务内。无效区间字段为 `id/startFrame/endFrame/reason`，重叠或首尾相接区间需按时间合并。

`no_action` 必须保存 `systemCode=NO_ACTION`、固定中英文描述，且不允许项目标签。普通小目标可保存 `keyFrames`，关键帧包含 `id/sequence/frame/type/objectName/detail`。审核节点批注保存在 `comments`，包含稳定序号、创建帧、位置、内容及 `open/addressed/resolved` 状态。

正式提交前，服务端与前端均需验证：每个单次任务全部帧被普通动作、无动作或无效区间并集覆盖；普通动作已选择项目原子技能；小目标未被无效区间完全覆盖；所有父子范围和同级区间合法。

### 13.4 保存草稿版本

`POST /api/operation/tasks/{taskId}/revisions`

```json
{
  "baseRevision": 3,
  "resultManifest": {
    "schemaVersion": "vla-video-hierarchy@11.0.0",
    "frameRate": 30,
    "totalFrames": 911,
    "goals": [],
    "actions": [],
    "invalidRanges": []
  }
}
```

响应：`{ "success": true, "data": { "revision": 4 } }`。`baseRevision` 不匹配时返回 `409 REVISION_CONFLICT`，禁止静默覆盖其他会话结果。

工作区、草稿、提交、退回与作废请求均携带：

```text
X-Operation-Session-Id
X-Operation-Session-Token
X-Operation-Lease-Version
X-CSRF-Token
```

页面每隔服务端返回的 `heartbeatIntervalSeconds` 发送心跳，离开时释放租约。只读预览以 `mode=view` 打开会话。

### 13.5 正式提交

`POST /api/operation/tasks/{taskId}/submit`

```json
{ "revision": 4, "resultManifest": {} }
```

服务端必须再次验证帧边界、同级重叠、父子包含、标签可用性、项目状态、任务占用和当前节点权限。成功后冻结当前版本并推进状态机；不得只依赖前端校验。

### 13.6 会话与其他节点动作

参考后端保留以下接口，后续接入多人占用、批注和质检退回时使用：

| 方法与路径 | 说明 |
|---|---|
| `POST /api/operation/sessions/open` | 获取编辑占用或只读会话 |
| `POST /api/operation/sessions/{sessionId}/heartbeat` | 编辑会话心跳 |
| `POST /api/operation/sessions/{sessionId}/release` | 离开页面时释放占用 |
| `POST /api/operation/tasks/{taskId}/reject` | 质检、审核、验收逐级退回 |
| `POST /api/operation/tasks/{taskId}/invalid` | 作废整条视频任务 |

操作台中的局部无效区间属于结果内容，不等同于作废整条视频。

## 前端环境切换

```bash
# 内置 Mock，默认模式
npm run dev:mock

# 真实后端
npm run dev:real
```

真实 API 地址通过 `.env.real` 的 `VITE_API_BASE_URL` 修改。页面组件不直接切换数据源，所有请求统一经过 `src/services/api.ts` 与 `src/services/managementApi.ts`。
# 已失效：前端早期接口草案

> 本文档仅保留作历史参考。当前前端实现与后端联调必须以根目录 [`backend-api.md`](../backend-api.md) 为准；本文中的 `/api/workbench/*`、`/api/operation/*` 等路径未由实际后端提供。
