import React, { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../../services/api'
import type { InAppNotification } from '../../types/collaboration'

export const NotificationDropdown: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  // Query notifications
  const token = api.getToken()
  const { data } = useQuery<{ notifications: InAppNotification[]; unread_count: number }>({
    queryKey: ['my-notifications', token],
    queryFn: async () => {
      const res = await api.get<any>('/notifications')
      return res?.data || res
    },
    enabled: !!token,
    refetchInterval: 15000,
  })

  const notifications = data?.notifications || []
  const unreadCount = data?.unread_count || 0

  // Mark all read mutation
  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await api.post('/notifications/mark-all-read')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-notifications'] })
    },
  })

  // Mark single read mutation
  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/notifications/${id}/read`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-notifications'] })
    },
  })

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-1.5 rounded hover:bg-slate-100 text-slate-600 transition-colors"
        title="In-app clinical notifications"
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-teal-700 text-white text-3xs font-bold rounded-full flex items-center justify-center font-mono">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-80 bg-white border border-slate-200 rounded-md shadow-lg z-50 text-xs overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <span>Notifications</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.2 bg-teal-100 text-teal-900 rounded-full text-3xs font-medium">
                  {unreadCount} unread
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllReadMutation.mutate()}
                className="text-3xs text-teal-800 hover:text-teal-950 font-medium flex items-center gap-1"
              >
                <CheckCheck className="w-3 h-3" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <div className="py-6 text-center text-slate-400 text-2xs">
                No recent notifications
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.notification_id}
                  onClick={() => !n.read && markReadMutation.mutate(n.notification_id)}
                  className={`p-2.5 transition-colors cursor-pointer hover:bg-slate-50 ${
                    !n.read ? 'bg-teal-50/40' : 'bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <span className="font-semibold text-slate-900 text-2xs line-clamp-1">{n.title}</span>
                    <span className="text-3xs font-mono text-slate-400 shrink-0">
                      {n.created_at.slice(11, 16)}
                    </span>
                  </div>
                  <p className="text-2xs text-slate-600 mt-0.5 line-clamp-2">{n.message}</p>
                  {n.link && (
                    <Link
                      to={n.link}
                      onClick={() => setIsOpen(false)}
                      className="mt-1 inline-flex items-center gap-0.5 text-3xs font-medium text-teal-700 hover:text-teal-900"
                    >
                      View in workspace <ExternalLink className="w-2.5 h-2.5" />
                    </Link>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
