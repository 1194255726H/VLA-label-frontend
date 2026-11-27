import { Children, Fragment, isValidElement, useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

function fieldsOf(children: ReactNode): ReactNode[] {
  return Children.toArray(children).flatMap((child) => isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment ? fieldsOf(child.props.children) : [child])
}

export function CollapsibleFilterForm({ children, onSubmit, onReset }: { children: ReactNode; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onReset: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [limit, setLimit] = useState(1)
  const root = useRef<HTMLDivElement>(null)
  const fieldsId = useId()
  const fields = fieldsOf(children)
  useLayoutEffect(() => {
    const element = root.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      // Fixed 250px fields, with the same 10px gap as the flex layout.
      setLimit(Math.max(1, Math.floor((entry.contentRect.width + 10) / 260)))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return <form className="management-filters project-video-filters collapsible-filter-form" onSubmit={onSubmit}>
    <div className="collapsible-filter-fields" ref={root} id={fieldsId}>{fields.map((field, index) => <div className="collapsible-filter-field" key={isValidElement(field) ? field.key ?? index : index} hidden={!expanded && index >= limit}>{field}</div>)}</div>
    <div className="collapsible-filter-actions"><button className="primary-button compact" type="submit">查询</button><button className="secondary-button compact" type="button" onClick={onReset}>重置</button>{fields.length > limit && <button className="filter-expand-button" type="button" aria-expanded={expanded} aria-controls={fieldsId} onClick={() => setExpanded((value) => !value)}>{expanded ? '收起' : '展开'}{expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>}</div>
  </form>
}
