import { useEffect, useState } from 'react'
import type { TasksSnapshot } from '@/lib/tasks'

export function useTasks(): TasksSnapshot | null {
  const [snapshot, setSnapshot] = useState<TasksSnapshot | null>(null)

  useEffect(() => {
    let active = true
    void window.api.tasks.getSnapshot().then((next) => {
      if (active) setSnapshot(next)
    })
    const unsubscribe = window.api.tasks.onSnapshotChange((next) => {
      if (active) setSnapshot(next)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return snapshot
}
