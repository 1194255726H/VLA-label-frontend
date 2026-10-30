import { useRef } from 'react'

export function selectionRange<T extends string | number>(ids: readonly T[], anchor: T | undefined, target: T, shiftKey: boolean) {
  const start = anchor === undefined ? -1 : ids.indexOf(anchor)
  const end = ids.indexOf(target)
  const hasRange = shiftKey && start >= 0 && end >= 0
  return {
    ids: hasRange ? ids.slice(Math.min(start, end), Math.max(start, end) + 1) : [target],
    anchor: hasRange ? anchor : target,
  }
}

export function useRangeSelection<T extends string | number>(ids: readonly T[], scope: string) {
  const anchor = useRef<{ scope: string; id: T } | undefined>(undefined)
  function range(target: T, shiftKey: boolean) {
    const result = selectionRange(ids, anchor.current?.scope === scope ? anchor.current.id : undefined, target, shiftKey)
    anchor.current = { scope, id: result.anchor! }
    return result.ids
  }
  function reset() { anchor.current = undefined }
  return { range, reset }
}
