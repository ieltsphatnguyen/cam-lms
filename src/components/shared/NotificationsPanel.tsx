import { useState, useEffect, useCallback } from 'react';
import { Bell, CheckCheck, FileText, Mic, RotateCcw, Send, BellOff } from 'lucide-react';
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from '@/lib/notifications';
import type { AppNotification, NotificationType } from '@/types/database';
import { formatDateTime } from '@/lib/format';

interface NotificationsPanelProps {
  recipientId: string;
  onNavigate?: (link: string, state?: unknown) => void;
}

const ICON_MAP: Record<NotificationType, React.ReactNode> = {
  new_submission: <FileText size={16} className="text-blue-500" />,
  resubmission: <RotateCcw size={16} className="text-amber-500" />,
  ready_to_publish: <Send size={16} className="text-emerald-500" />,
  feedback_published: <CheckCheck size={16} className="text-emerald-500" />,
  revision_requested: <RotateCcw size={16} className="text-red-500" />,
  feedback_updated: <Bell size={16} className="text-blue-500" />,
};

export default function NotificationsPanel({ recipientId, onNavigate }: NotificationsPanelProps) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await fetchNotifications(recipientId);
      setNotifications(data);
    } catch {
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [recipientId]);

  useEffect(() => {
    load();
  }, [load]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleClick = async (notif: AppNotification) => {
    if (!notif.read) {
      try {
        await markNotificationRead(notif.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n)),
        );
      } catch { /* ignore */ }
    }
    if (notif.link && onNavigate) {
      const [path, queryString] = notif.link.split('?');
      const route = path.replace(/^\//, '').replace(/\//g, '-');
      let state: unknown = undefined;
      if (queryString) {
        const params = new URLSearchParams(queryString);
        const stateObj: Record<string, string> = {};
        for (const [key, value] of params.entries()) {
          stateObj[key] = value;
        }
        state = stateObj;
      }
      onNavigate(route, state);
    }
  };

  const handleMarkAll = async () => {
    try {
      await markAllNotificationsRead(recipientId);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch { /* ignore */ }
  };

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Bell size={18} className="text-slate-600" />
          <h2 className="font-semibold text-slate-700">Notifications</h2>
          {unreadCount > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAll}
            className="text-xs font-medium text-blue-600 transition hover:text-blue-700"
          >
            Mark all read
          </button>
        )}
      </div>

      {loading ? (
        <p className="py-4 text-center text-sm text-slate-400">Loading…</p>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-slate-400">
          <BellOff size={28} className="mb-2 text-slate-300" />
          <p className="text-sm">No notifications yet.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {notifications.slice(0, 10).map((notif) => (
            <button
              key={notif.id}
              onClick={() => handleClick(notif)}
              className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition hover:shadow-sm ${
                notif.read
                  ? 'border-slate-100 bg-white'
                  : 'border-blue-100 bg-blue-50/50'
              }`}
            >
              <div className="mt-0.5 shrink-0">
                {ICON_MAP[notif.type] ?? <Bell size={16} className="text-slate-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${notif.read ? 'font-medium text-slate-700' : 'font-semibold text-slate-800'}`}>
                  {notif.title}
                </p>
                {notif.body && (
                  <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{notif.body}</p>
                )}
                <p className="mt-1 text-xs text-slate-400">{formatDateTime(notif.created_at)}</p>
              </div>
              {!notif.read && (
                <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
