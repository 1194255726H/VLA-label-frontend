# VLA 后端接口文档

状态：第一版接口草案
日期：2026-08-07
前缀：`/api`

## 1. 通用约定

### 1.1 认证

第一版使用 Django session cookie。

登录后，后续接口依赖浏览器或客户端自动携带 cookie。

### 1.2 响应格式

成功：

```json
{
  "code": "ok",
  "message": "",
  "data": {}
}
```

失败：

```json
{
  "code": "validation_error",
  "message": "参数错误"
}
```

### 1.3 时间单位

视频标注时间统一使用毫秒整数：

- `start_ms`
- `end_ms`

## 2. 健康检查

### GET `/api/health`

返回服务和数据库状态。

响应：

```json
{
  "code": "ok",
  "message": "",
  "data": {
    "service": "vla-label-backend",
    "database": "ok"
  }
}
```

## 3. 认证接口

### POST `/api/auth/login`

请求：

```json
{
  "username": "system_admin",
  "password": "admin@micv.cn"
}
```

响应：

```json
{
  "code": "ok",
  "message": "",
  "data": {
    "id": 1,
    "username": "admin",
    "display_name": ""
  }
}
```

### POST `/api/auth/logout`

退出当前 session。

### GET `/api/auth/me`

返回当前登录用户。

## 4. 角色管理

### GET `/api/auth/roles`

查询角色列表。

角色由初始化脚本创建：

```bash
python manage.py init_roles
```

初始化角色：

| code | 名称 | 工作流节点 |
| --- | --- | --- |
| `admin` | 管理员 | - |
| `project_manager` | 项目经理 | - |
| `annotator` | 标注员 | `annotation` |
| `quality_checker` | 质检员 | `quality_check` |
| `reviewer` | 审核员 | `review` |
| `acceptor` | 验收员 | `acceptance` |

响应：

```json
{
  "code": "ok",
  "message": "",
  "data": {
    "items": [
      {
        "id": 1,
        "code": "annotator",
        "name": "标注员",
        "description": "标注节点作业",
        "workflow_node": "annotation"
      }
    ]
  }
}
```

## 5. 团队管理

### GET `/api/auth/teams`

分页查询团队，支持名称模糊搜索和状态筛选。

查询参数：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `keyword` | 否 | 团队名称模糊搜索 |
| `status` | 否 | `enabled` 或 `disabled` |
| `page` | 否 | 页码，默认 1 |
| `page_size` | 否 | 每页数量，默认 10，最大 100 |

响应：

```json
{
  "code": "ok",
  "message": "",
  "data": {
    "items": [
      {
        "id": 1,
        "name": "清华车端项目团队",
        "description": "主团队",
        "status": "enabled",
        "member_count": 2,
        "enabled_member_count": 2,
        "project_count": 0
      }
    ],
    "total": 1,
    "page": 1,
    "page_size": 10,
    "pages": 1
  }
}
```

### POST `/api/auth/teams`

添加团队。

请求：

```json
{
  "name": "清华车端项目团队",
  "description": "主团队",
  "status": "enabled"
}
```

### GET `/api/auth/teams/{team_id}`

查询团队详情。

### PATCH `/api/auth/teams/{team_id}`

编辑团队。

请求：

```json
{
  "name": "清华路端项目团队",
  "description": "更新后的描述"
}
```

### POST `/api/auth/teams/{team_id}/enable`

启用团队。

### POST `/api/auth/teams/{team_id}/disable`

停用团队。

### DELETE `/api/auth/teams/{team_id}`

删除团队。

当前实现为物理删除。团队删除后，原团队成员的 `team_id` 会置空。

## 6. 成员管理

### GET `/api/auth/members`

分页查询成员，支持团队、姓名/账号/手机号模糊搜索、角色、状态筛选。

查询参数：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `team_id` | 否 | 团队 ID |
| `keyword` | 否 | 成员姓名、账号或手机号模糊搜索 |
| `role` | 否 | 角色 code，例如 `annotator` |
| `role_id` | 否 | 角色 ID |
| `status` | 否 | `enabled` 或 `disabled` |
| `page` | 否 | 页码，默认 1 |
| `page_size` | 否 | 每页数量，默认 10，最大 100 |

响应：

```json
{
  "code": "ok",
  "message": "",
  "data": {
    "items": [
      {
        "id": 2,
        "username": "zhangsan",
        "display_name": "张三",
        "phone": "18800020005",
        "email": "",
        "is_active_member": true,
        "team": {
          "id": 1,
          "name": "清华车端项目团队"
        },
        "roles": [
          {
            "id": 3,
            "code": "annotator",
            "name": "标注员"
          }
        ]
      }
    ],
    "total": 1,
    "page": 1,
    "page_size": 10,
    "pages": 1
  }
}
```

### POST `/api/auth/teams/{team_id}/members`

新增一个人员，并添加到指定团队下。

请求：

```json
{
  "username": "zhangsan",
  "password": "demo123456",
  "display_name": "张三",
  "phone": "18800020005",
  "email": "zhangsan@example.com",
  "role_ids": [3, 4],
  "is_active_member": true
}
```

### GET `/api/auth/members/{user_id}`

查询成员详情。

### PATCH `/api/auth/members/{user_id}`

编辑成员基础信息和角色。

请求：

```json
{
  "display_name": "张三三",
  "phone": "18800029999",
  "email": "zhangsan@example.com",
  "role_ids": [5],
  "is_active_member": false
}
```

### POST `/api/auth/members/{user_id}/password`

修改成员密码。

请求：

```json
{
  "password": "newpass123456"
}
```

### POST `/api/auth/members/{user_id}/move`

移动成员到另一个团队。

请求：

```json
{
  "team_id": 2
}
```

### DELETE `/api/auth/members/{user_id}`

删除成员。

### POST `/api/auth/members/batch-delete`

批量删除成员。

请求：

```json
{
  "ids": [2, 3, 4]
}
```

响应：

```json
{
  "code": "ok",
  "message": "",
  "data": {
    "deleted": 3
  }
}
```

## 7. 标签管理

标签管理是系统级共享资源。项目通过项目配置引用标签库，任务通过配置快照固化实际使用版本。

第一版接口路径按 demo PRD 使用：

- `/api/data/label-libraries`
- `/api/ref/label-libraries`

只有管理员可写。普通业务角色写入返回 `403`。

### 7.1 标签库列表

#### GET `/api/data/label-libraries`

分页查询标签库，支持名称模糊搜索。

查询参数：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `keyword` | 否 | 标签库名称模糊搜索 |
| `page` | 否 | 页码，默认 1 |
| `page_size` | 否 | 每页数量，默认 10，最大 100 |

响应：

```json
{
  "code": "ok",
  "message": "",
  "data": {
    "items": [
      {
        "id": 1,
        "code": "LIB-ABC123",
        "name": "园区单次任务标签库",
        "description": "用于园区动作",
        "enabled": true,
        "status": "enabled",
        "label_count": 2,
        "created_at": "2026-08-10T16:10:00+08:00",
        "updated_at": "2026-08-10T16:10:00+08:00"
      }
    ],
    "total": 1,
    "page": 1,
    "page_size": 10,
    "pages": 1
  }
}
```

### 7.2 创建标签库

#### POST `/api/data/label-libraries`

请求：

```json
{
  "name": "园区单次任务标签库",
  "description": "用于园区动作",
  "enabled": true
}
```

规则：

- `name` 必填，未删除标签库内全局唯一。
- `description` 最多 500 字。
- `enabled=false` 时创建为停用状态。

### 7.3 查看标签库

#### GET `/api/data/label-libraries/{labelLibraryId}`

返回标签库详情，并带当前未删除标签摘要。

```json
{
  "code": "ok",
  "message": "",
  "data": {
    "id": 1,
    "name": "园区单次任务标签库",
    "label_count": 2,
    "labels": {
      "items": [],
      "total": 2
    }
  }
}
```

### 7.4 编辑标签库

#### PATCH `/api/data/label-libraries/{labelLibraryId}`

请求：

```json
{
  "name": "园区动作标签库",
  "description": "已编辑",
  "enabled": false
}
```

### 7.5 删除标签库

#### DELETE `/api/data/label-libraries/{labelLibraryId}`

逻辑删除标签库。

规则：

- 如果标签库已被项目作业配置引用，返回 `409 label_library_referenced`。
- 删除标签库时会停用并逻辑删除该库下未删除标签。

### 7.6 标签列表/搜索

#### GET `/api/data/label-libraries/{labelLibraryId}/labels`

分页查询标签，支持名称、适用层级和创建时间筛选。

查询参数：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `keyword` | 否 | 标签名称模糊搜索 |
| `applies_to` | 否 | `goal` 或 `action` |
| `created_from` | 否 | 创建日期起始，格式 `YYYY-MM-DD` |
| `created_to` | 否 | 创建日期结束，格式 `YYYY-MM-DD` |
| `page` | 否 | 页码，默认 1 |
| `page_size` | 否 | 每页数量，默认 10，最大 100 |

响应：

```json
{
  "code": "ok",
  "message": "",
  "data": {
    "items": [
      {
        "id": 1,
        "library_id": 1,
        "code": "LBL-ABC123",
        "name": "拿起杯子",
        "color": "#31AC39",
        "applies_to": "goal",
        "applies_to_label": "单次任务",
        "enabled": true,
        "sort_order": 0,
        "created_at": "2026-08-10T16:10:00+08:00"
      }
    ],
    "total": 1,
    "page": 1,
    "page_size": 10,
    "pages": 1
  }
}
```

### 7.7 创建标签

#### POST `/api/data/label-libraries/{labelLibraryId}/labels`

请求：

```json
{
  "name": "拿起杯子",
  "color": "#31AC39",
  "applies_to": "goal",
  "sort_order": 10
}
```

规则：

- `name` 必填，最多 100 字，同一标签库内未删除标签名称唯一。
- `color` 必填，必须是六位十六进制颜色，例如 `#31AC39`。
- `applies_to` 必填，创建/编辑/导入只允许 `goal` 或 `action`。
- `goal` 表示单次任务，`action` 表示小目标。
- 新建标签默认 `enabled=true`。
- 不允许请求中出现 `configType`、`config_type`、标签组、下级选项、选择策略等旧结构字段。

### 7.8 查看标签

#### GET `/api/data/label-libraries/{labelLibraryId}/labels/{labelId}`

查询单个标签详情。

### 7.9 编辑标签

#### PATCH `/api/data/label-libraries/{labelLibraryId}/labels/{labelId}`

请求：

```json
{
  "name": "放下杯子",
  "color": "#56CCF2",
  "applies_to": "action",
  "sort_order": 20
}
```

规则：

- 可修改名称、颜色、适用层级和排序。
- 标签编码保持稳定。
- 编辑不改变原启用状态。
- 历史 `both` 标签必须重新选择 `goal` 或 `action` 后才能保存。

### 7.10 删除标签

#### DELETE `/api/data/label-libraries/{labelLibraryId}/labels/{labelId}`

逻辑删除单个标签。

规则：

- 标签必须归属当前标签库，否则返回 404。
- 删除后 `enabled=false` 且 `deleted_at` 有值。
- 删除后不再出现在管理列表和操作台可用标签中。

### 7.11 通过 JSON 导入标签

#### POST `/api/data/label-libraries/{labelLibraryId}/labels/import`

请求格式由后端定义为扁平结构：

```json
{
  "labels": [
    {
      "code": "PICK_CUP",
      "name": "拿起杯子",
      "color": "#31AC39",
      "applies_to": "goal",
      "enabled": true,
      "sort_order": 10
    },
    {
      "name": "打开门",
      "color": "#BB6BD9",
      "applies_to": "action"
    }
  ]
}
```

规则：

- `labels` 必须包含 1 到 500 条。
- 每条标签必须包含 `name`、`color`、`applies_to`。
- `code` 可选，不传时后端生成。
- `enabled` 可选，默认 `true`。
- `sort_order` 可选，默认 `0`。
- 导入只允许扁平标签，不允许标签组、下级选项、旧 `configType/config_type` 或选择策略字段。
- 同批次名称不能重复。
- 不能与当前标签库已有未删除标签重名。
- 任一项非法时整批拒绝，不写入任何标签。

响应：

```json
{
  "code": "ok",
  "message": "",
  "data": {
    "imported_count": 2,
    "items": []
  }
}
```

### 7.12 标签库引用列表

#### GET `/api/ref/label-libraries`

用于项目配置等下拉选择，只返回启用且未删除标签库。

响应：

```json
{
  "code": "ok",
  "message": "",
  "data": {
    "items": [
      {
        "value": 1,
        "label": "园区单次任务标签库",
        "enabled": true
      }
    ]
  }
}
```

## 8. 外部同步接口

外部接口协议未最终确定，第一版先提供项目和任务 upsert 入口，并保存原始 payload。

### POST `/api/sync/projects`

同步或更新项目。

请求：

```json
{
  "external_project_id": "proj-001",
  "name": "VLA 测试项目",
  "description": "测试项目",
  "status": "active",
  "work_config": {
    "completion_node": "quality_check",
    "assignment_strategy": "manual_claim",
    "model_generation_node": "annotation",
    "active_task_limit": 10,
    "allow_same_user_multi_node": true,
    "require_atomic_task_coverage": false
  }
}
```

关键字段：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `external_project_id` | 是 | 外部项目 ID |
| `name` | 是 | 项目名称 |
| `work_config.completion_node` | 否 | 完成节点：`annotation`、`quality_check`、`review`、`acceptance` |
| `work_config.assignment_strategy` | 否 | 分配策略：`manual_claim`、`load_balance`、`round_robin` |

### POST `/api/sync/tasks`

同步或更新视频任务。一条任务对应一条视频。

请求：

```json
{
  "external_project_id": "proj-001",
  "external_task_id": "task-001",
  "title": "测试视频 1",
  "video_uri": "s3://vla-label/raw/task-001.mp4",
  "video_meta": {
    "duration_ms": 1800000
  }
}
```

关键字段：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `external_project_id` | 是 | 外部项目 ID |
| `external_task_id` | 是 | 外部任务 ID |
| `video_uri` | 是 | 原始视频地址，通常为 MinIO/S3 URI |
| `video_meta` | 否 | 视频元信息 |

## 9. 项目接口

### GET `/api/projects/`

返回项目列表，支持分页、关键字和状态筛选。

查询参数：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `page` | 否 | 页码，默认 1 |
| `page_size` | 否 | 每页数量，默认 10，最大 100 |
| `keyword` | 否 | 项目名称、编号、描述模糊搜索 |
| `status` | 否 | `not_started`、`running`、`paused`、`finished`、`archived` |
| `team_id` | 否 | 按关联团队筛选 |
| `owner_id` | 否 | 按项目负责人筛选 |

响应：

```json
{
  "items": [
    {
      "id": 1,
      "external_project_id": "PRJ-9A12BC34EF",
      "code": "PRJ-9A12BC34EF",
      "name": "清华路端项目",
      "description": "城市路口 VLA 视频动作标注",
      "status": "running",
      "teams": [{"id": 1, "name": "清华路端项目团队", "status": "enabled"}],
      "owner": {"id": 2, "username": "pm", "display_name": "项目经理"},
      "delivery_at": "2026-09-01",
      "task_count": 120,
      "data_count": 120,
      "annotator_count": 8,
      "selected_duration_ms": null,
      "effective_duration_ms": null,
      "invalid_duration_ms": null,
      "unselected_duration_ms": null,
      "atomic_task_count": 0,
      "atomic_action_count": 0,
      "progress_percent": 35.0,
      "work_config": {
        "completion_node": "acceptance",
        "model_generation_node": "annotation",
        "assignment_strategy": "manual_claim",
        "active_task_limit": 10,
        "label_library_ids": [1]
      }
    }
  ],
  "total": 1,
  "page": 1,
  "page_size": 10,
  "pages": 1
}
```

### POST `/api/projects/`

创建项目。项目配置和标注规范跟随项目一起保存，并生成配置快照。

请求：

```json
{
  "name": "清华路端项目",
  "description": "城市路口 VLA 视频动作标注",
  "team_ids": [1],
  "owner_id": 2,
  "delivery_at": "2026-09-01",
  "completion_node": "acceptance",
  "model_generation_node": "annotation",
  "assignment_strategy": "manual_claim",
  "active_task_limit": 10,
  "label_library_ids": [1],
  "annotation_guideline": {
    "type": "link",
    "display_name": "标注规范",
    "url": "https://example.com/guideline"
  }
}
```

字段约束：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `name` | 是 | 项目名称，同未删除项目内不可重复 |
| `team_ids` | 否 | 关联团队，只允许启用团队 |
| `owner_id` | 否 | 项目负责人，用户必须启用且拥有 `project_manager` 角色 |
| `delivery_at` | 否 | 交付日期，格式 `YYYY-MM-DD` |
| `completion_node` | 否 | 完成节点：`quality_check`、`review`、`acceptance` |
| `model_generation_node` | 否 | 模型生成环节：`annotation`、`quality_check`、`review`、`acceptance`，不能晚于完成节点 |
| `assignment_strategy` | 否 | `manual_claim`、`load_balance`、`round_robin`；默认 `manual_claim` |
| `label_library_ids` | 否 | 项目使用的标签库，只允许启用且未删除标签库 |
| `annotation_guideline` | 否 | 标注规范，支持链接或文件元数据 |

标注规范为链接：

```json
{
  "type": "link",
  "display_name": "标注规范",
  "url": "https://example.com/guideline"
}
```

链接必须是 HTTPS，且不能包含账号密码。

标注规范为文件：

```json
{
  "type": "file",
  "display_name": "规范.pdf",
  "object_key": "projects/1/guidelines/spec.pdf",
  "mime_type": "application/pdf",
  "byte_size": 1024
}
```

文件本体由前端或上传服务放到 MinIO，本接口只保存文件元数据；文件大小限制为 1B 到 20MB。

### GET `/api/projects/{project_id}`

返回项目详情、工作配置、关联标签库和最新配置快照。

### PATCH `/api/projects/{project_id}`

编辑项目基础信息、关联团队、项目负责人、工作配置、标签库和标注规范。请求字段同创建接口，传入哪些字段更新哪些字段。

### DELETE `/api/projects/{project_id}`

软删除项目。项目下存在未删除任务时返回 `409 project_has_tasks`。

### POST `/api/projects/{project_id}/status`

修改项目状态。

请求：

```json
{
  "status": "running",
  "reason": "启动生产"
}
```

允许流转：

| 当前状态 | 可流转到 |
| --- | --- |
| `not_started` | `running`、`paused` |
| `running` | `paused`、`finished` |
| `paused` | `running`、`finished` |
| `finished` | `archived` |
| `archived` | 无 |

项目进入 `running` 后，如果分配策略是 `load_balance` 或 `round_robin`，会尝试自动分配当前待处理任务。

### GET `/api/projects/{project_id}/tasks`

查询项目下任务列表，支持分页、关键字、状态、节点和处理人筛选。

查询参数：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `page` | 否 | 页码，默认 1 |
| `page_size` | 否 | 每页数量，默认 10，最大 100 |
| `keyword` | 否 | 任务标题、外部任务 ID 模糊搜索 |
| `status` | 否 | 任务状态 |
| `current_node` | 否 | 当前节点 |
| `assignee_id` | 否 | 当前处理人 |

### POST `/api/projects/{project_id}/tasks`

创建项目任务。当前用于开发和联调；生产形态将由外部系统通过 HTTP 同步项目和任务，外部同步接口待对方文档确认后继续开发。

请求：

```json
{
  "external_task_id": "video-001",
  "title": "路口视频 001",
  "video_uri": "s3://vla-label/raw/video-001.mp4",
  "video_meta": {
    "duration_ms": 1800000,
    "width": 1920,
    "height": 1080
  },
  "attributes": {
    "scene": "crossroad"
  }
}
```

字段约束：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `external_task_id` | 否 | 外部任务 ID；不传则后端生成；同项目内不可重复 |
| `title` | 否 | 任务标题 |
| `video_uri` | 是 | MinIO/S3 视频地址，当前要求 `.mp4` |
| `video_meta` | 否 | 视频元信息对象 |
| `attributes` / `raw_payload` | 否 | 外部扩展属性对象 |

如果项目状态为 `running` 且策略为自动分配，新任务创建后会立即尝试分配给对应节点工作人员；`manual_claim` 策略下任务保留未分配，出现在可领取任务池。

### GET `/api/projects/{project_id}/tasks/{task_id}`

返回项目内任务详情。

### PATCH `/api/projects/{project_id}/tasks/{task_id}`

编辑任务。当前只允许编辑未领取或退回待处理的任务。

### DELETE `/api/projects/{project_id}/tasks/{task_id}`

软删除任务。已分配任务不能删除。

## 10. 工作台与任务接口

### GET `/api/tasks/pool`

返回当前用户可领取的任务池。普通用户只返回其项目成员权限覆盖的当前节点任务；管理员可看到所有运行中项目的未分配任务。

### GET `/api/tasks/my`

返回当前用户已领取或被分配的任务，包括人工领取和自动分配任务。

### GET `/api/tasks/{task_id}`

返回任务详情和当前已提交标注版本。

响应核心结构：

```json
{
  "task": {
    "id": 1,
    "project_id": 1,
    "external_task_id": "task-001",
    "video_uri": "s3://vla-label/raw/task-001.mp4",
    "attributes": {},
    "status": "pending",
    "current_node": "annotation",
    "current_assignee_id": null,
    "assignment_source": ""
  },
  "current_revision": null
}
```

### POST `/api/tasks/{task_id}/claim`

领取任务。

约束：

- 任务当前不能已有处理人。
- 用户需要有对应项目和节点权限；管理员可绕过项目成员限制。
- 同一用户同项目活跃任务数不能超过项目配置上限。

## 11. 标注接口

### POST `/api/tasks/{task_id}/annotation-draft`

保存标注草稿，生成一个 draft revision。

### POST `/api/tasks/{task_id}/submit-annotation`

提交标注，生成 submitted revision，并推动任务流转到下一个节点或完成。

请求：

```json
{
  "atomic_tasks": [
    {
      "start_ms": 0,
      "end_ms": 10000,
      "sequence": 0,
      "label_id": null,
      "description": "拿起杯子",
      "actions": [
        {
          "start_ms": 1000,
          "end_ms": 3000,
          "sequence": 0,
          "label_id": null,
          "description": "手接近杯子"
        }
      ]
    }
  ],
  "invalid_intervals": [
    {
      "start_ms": 20000,
      "end_ms": 25000,
      "reason": "画面不可用",
      "description": "严重遮挡"
    }
  ],
  "meta": {}
}
```

校验：

- 原子任务 `start_ms < end_ms`。
- 同一 revision 内原子任务不能重叠。
- 原子动作 `start_ms < end_ms`。
- 原子动作必须落在父级原子任务范围内。
- 同一父级原子任务内原子动作不能重叠。

## 12. 质检/审核/验收接口

### POST `/api/tasks/{task_id}/decision`

提交当前节点处理结论。

请求：

```json
{
  "node": "quality_check",
  "decision": "approved",
  "opinion": "通过"
}
```

字段：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `node` | 是 | 当前节点 |
| `decision` | 是 | `approved` 或 `rejected` |
| `opinion` | 否 | 处理意见 |

流转：

- `approved`：进入下一个节点；如果当前节点是项目完成节点，则任务完成。
- `rejected`：第一版默认退回标注节点。

## 13. 大模型描述接口

### POST `/api/modeling/describe`

输入视频片段，返回描述文本。第一版是 mock provider，后续替换真实模型服务。

请求：

```json
{
  "task_id": 1,
  "start_ms": 1000,
  "end_ms": 3000,
  "prompt": "描述这个动作"
}
```

响应：

```json
{
  "code": "ok",
  "message": "",
  "data": {
    "job_id": 1,
    "status": "succeeded",
    "description": "模型描述接口已接入，当前为 mock provider。"
  }
}
```

## 14. 切割接口

### POST `/api/cutting/tasks/{task_id}/jobs`

为已完成任务创建最终切割 job。

约束：

- 任务状态必须是 `completed` 或之前切割失败后的 `cut_failed`。
- 任务必须存在已提交的标注版本。
- 第一版会基于当前 submitted revision 创建 clips。
- clips 包含原子任务 clip 和原子动作 clip。

响应：

```json
{
  "code": "ok",
  "message": "",
  "data": {
    "id": 1,
    "task_id": 1,
    "status": "queued",
    "source_uri": "s3://vla-label/raw/task-001.mp4",
    "output_prefix": "video-segments/project-1/task-1/job-1",
    "total_clips": 2,
    "succeeded_clips": 0,
    "failed_clips": 0,
    "manifest_uri": "",
    "clips": []
  }
}
```

### GET `/api/cutting/jobs/{job_id}`

查询切割 job 和 clips。

## 15. 回传接口

### GET `/api/callbacks/`

查询外部回传记录。

### POST `/api/callbacks/{record_id}/retry`

重试回传。第一版为 mock success，等外部系统协议确定后替换真实 HTTP 回传。

## 16. 当前缺口

以下接口/能力还需要继续开发：

- 项目配置更新接口。
- 管理员手动分配/改派接口。
- Celery worker 自动触发切割 job。
- MinIO 真实上传和预签名 URL。
- 外部系统正式回传协议。
- 大模型正式 provider。
