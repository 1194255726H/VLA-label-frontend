import { ArrowLeft, ChevronDown, CircleAlert, Eye, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { annotationDataApi } from '../services/annotationDataApi'
import { projectApi } from '../services/managementApi'
import type { AnnotationDataItem, AnnotationDataStatus, SessionResponse, TaskNode } from '../types/api'

const statuses: Array<{ key: AnnotationDataStatus | 'all'; label: string }> = [{ key: 'all', label: '全部' }, { key: 'pending', label: '待处理' }, { key: 'processing', label: '处理中' }, { key: 'completed', label: '已完成' }, { key: 'voided', label: '已作废' }, { key: 'exception', label: '异常' }]
const nodeLabels: Record<TaskNode, string> = { annotation: '标注', review: '质检', quality: '审核', acceptance: '验收' }
function duration(value: number) { const minutes = Math.floor(value / 60); const seconds = Math.round(value % 60); return value ? `${minutes ? `${minutes}分` : ''}${seconds}秒` : '—' }

export function AnnotationDataPage({ session }: { session: SessionResponse }) {
  const { projectId = '' } = useParams(); const navigate = useNavigate()
  const [items, setItems] = useState<AnnotationDataItem[]>([]); const [projectName, setProjectName] = useState('项目标注数据'); const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<AnnotationDataStatus | 'all'>('all'); const [keywordInput, setKeywordInput] = useState(''); const [keyword, setKeyword] = useState(''); const [node, setNode] = useState<TaskNode | ''>('')
  useEffect(() => { Promise.all([annotationDataApi.list(projectId), projectApi.list()]).then(([data, projects]) => { setItems(data); setProjectName(projects.find((item) => item.id === projectId)?.name || '项目标注数据') }).finally(() => setLoading(false)) }, [projectId])
  const filtered = useMemo(() => items.filter((item) => (status === 'all' || item.status === status) && (!node || item.node === node) && (!keyword || `${item.name}${item.id}`.toLowerCase().includes(keyword.toLowerCase()))), [items, keyword, node, status])
  const counts = useMemo(() => Object.fromEntries(statuses.map(({ key }) => [key, key === 'all' ? items.length : items.filter((item) => item.status === key).length])), [items])
  return <AppShell user={session.account}><section className="management-page"><section className="management-panel panel">
    <header className="management-toolbar annotation-data-heading"><div className="detail-title"><button className="icon-button bordered" type="button" onClick={() => navigate('/projects')} aria-label="返回项目管理"><ArrowLeft size={17} /></button><div><h2>{projectName}</h2><p>标注数据管理 · {projectId}</p></div></div><span>项目内数据、任务状态与 VLA 结果汇总</span></header>
    <div className="status-segments annotation-data-tabs">{statuses.map((item) => <button key={item.key} type="button" className={status === item.key ? 'active' : ''} onClick={() => setStatus(item.key)}>{item.label}<span>{counts[item.key] || 0}</span></button>)}</div>
    <div className="management-filters"><label><span>数据名称</span><div className="filter-control"><Search size={16} /><input value={keywordInput} onChange={(event) => setKeywordInput(event.target.value)} placeholder="数据名称或数据 ID" /></div></label><label><span>当前节点</span><div className="filter-control select"><select value={node} onChange={(event) => setNode(event.target.value as TaskNode | '')}><option value="">全部节点</option>{Object.entries(nodeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><ChevronDown size={14} /></div></label><button className="primary-button compact" type="button" onClick={() => setKeyword(keywordInput.trim())}>查询</button><button className="secondary-button compact" type="button" onClick={() => { setKeywordInput(''); setKeyword(''); setNode('') }}>重置</button></div>
    <div className="management-table-wrap"><table className="management-table annotation-data-table"><thead><tr><th>标注数据名称</th><th>状态</th><th>当前节点</th><th>流转类型</th><th>总时长</th><th>入选时长</th><th>有效时长</th><th>无效时长</th><th>未入选时长</th><th>单次任务数</th><th>小目标数</th><th>处理人</th><th>更新时间</th><th>操作</th></tr></thead><tbody>
      {loading ? <tr><td colSpan={14}><div className="management-empty">正在加载标注数据...</div></td></tr> : filtered.map((item) => <tr key={item.id}><td><div className="entity-name"><strong>{item.name}</strong><small>{item.id}</small></div></td><td><span className={`annotation-data-status ${item.status}`}>{item.statusLabel}</span></td><td><span className="node-tag blue">{nodeLabels[item.node]}</span></td><td>{item.workType === 'returned' ? <span className="return-type">退回返修</span> : '正常流转'}</td><td>{duration(item.totalDuration)}</td><td>{duration(item.selectedDuration)}</td><td>{duration(item.validDuration)}</td><td>{duration(item.invalidDuration)}</td><td>{duration(item.unselectedDuration)}</td><td>{item.goalCount ?? '—'}</td><td>{item.actionCount ?? '—'}</td><td>{item.ownerName}</td><td>{item.updatedAt}</td><td><div className="row-actions"><button type="button" disabled={!item.taskId} onClick={() => item.taskId && navigate(`/annotation/${encodeURIComponent(item.taskId)}?readonly=1`)}><Eye size={15} />预览</button></div></td></tr>)}
      {!loading && !filtered.length && <tr><td colSpan={14}><div className="management-empty"><CircleAlert size={32} />暂无符合条件的标注数据</div></td></tr>}
    </tbody></table></div><footer className="management-footer"><span>共 {filtered.length} 条</span><div className="pagination"><button disabled type="button">‹</button><strong>1</strong><button disabled type="button">›</button><span>10条/页</span></div></footer>
  </section></section></AppShell>
}
