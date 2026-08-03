import { useState, useEffect } from 'react';
import { School, BookOpen, TrendingUp, ClipboardList, Clock, CheckCircle, Calendar } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import JoinClassModal from './JoinClassModal';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import NotificationsPanel from '@/components/shared/NotificationsPanel';
import { Plus, ArrowRight } from 'lucide-react';
import { formatDateTime } from '@/lib/format';
import type { PublishedAssignmentWithDetails } from '@/types/database';

interface Stats {
  classCount: number;
}

interface TaskItem {
  id: number;
  name: string;
  class_name: string;
  available_from: string | null;
  due_date: string | null;
  item_count: number;
}

interface Props {
  onOpenAssignments: () => void;
  onNavigate: (page: string, state?: unknown) => void;
}

export default function StudentDashboard({ onOpenAssignments, onNavigate }: Props) {
  const { profile } = useAuth();
  const [stats, setStats] = useState<Stats>({ classCount: 0 });
  const [loading, setLoading] = useState(true);
  const [joinOpen, setJoinOpen] = useState(false);
  const [todaysTasks, setTodaysTasks] = useState<TaskItem[]>([]);
  const [upcomingTasks, setUpcomingTasks] = useState<TaskItem[]>([]);
  const [completedTasks, setCompletedTasks] = useState<TaskItem[]>([]);

  async function loadData() {
    if (!profile?.student_id) return;

    const [enrollments, assignmentData] = await Promise.all([
      supabase
        .from('classstudents')
        .select('class_id, classes!inner(archived_at)')
        .eq('student_id', profile.student_id),
      supabase
        .from('classstudents')
        .select('class_id')
        .eq('student_id', profile.student_id),
    ]);

    const activeCount = (enrollments.data ?? []).filter(
      (e) => (e.classes as unknown as { archived_at: string | null }).archived_at === null,
    ).length;
    setStats({ classCount: activeCount });

    const classIds = (assignmentData.data ?? []).map((e) => e.class_id as number);
    if (classIds.length === 0) {
      setTodaysTasks([]);
      setUpcomingTasks([]);
      setCompletedTasks([]);
      setLoading(false);
      return;
    }

    const { data: published } = await supabase
      .from('published_assignments')
      .select('*, classes(name)')
      .in('class_id', classIds)
      .order('published_at', { ascending: false });

    const ids = (published ?? []).map((r) => r.id as number);
    let counts: Record<number, number> = {};
    if (ids.length > 0) {
      const { data: countData } = await supabase
        .from('published_assignment_items')
        .select('published_assignment_id, available_from, due_date')
        .in('published_assignment_id', ids);
      counts = (countData ?? []).reduce<Record<number, number>>((acc, row) => {
        const key = row.published_assignment_id as number;
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {});

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

      const tasks: TaskItem[] = (published ?? []).map((row) => {
        const cls = row.classes as unknown as { name: string } | null;
        return {
          id: row.id as number,
          name: row.name as string,
          class_name: cls?.name ?? 'Unknown',
          available_from: row.available_from as string | null,
          due_date: row.due_date as string | null,
          item_count: counts[row.id as number] ?? 0,
        };
      });

      setTodaysTasks(
        tasks.filter((t) => {
          const avail = t.available_from ? new Date(t.available_from) : null;
          const due = t.due_date ? new Date(t.due_date) : null;
          if (avail && avail <= todayEnd && (!due || due >= todayStart)) return true;
          if (due && due >= todayStart && due <= todayEnd) return true;
          return false;
        }),
      );
      setUpcomingTasks(
        tasks.filter((t) => {
          const avail = t.available_from ? new Date(t.available_from) : null;
          return avail && avail > todayEnd;
        }),
      );
      setCompletedTasks(tasks.slice(0, 5));
    }

    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [profile?.student_id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const cards = [
    {
      label: 'My Classes',
      value: stats.classCount,
      icon: <School size={22} />,
      color: 'bg-blue-50 text-blue-600',
    },
  ];

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Student Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Welcome back! Here's your overview.
          </p>
        </div>
        <Button icon={<Plus size={16} />} onClick={() => setJoinOpen(true)}>
          Join a Class
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">{c.label}</p>
                <p className="mt-1 text-3xl font-bold text-slate-800">
                  {c.value.toLocaleString()}
                </p>
              </div>
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${c.color}`}>
                {c.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Today's Tasks */}
      <div className="mt-8">
        <div className="mb-3 flex items-center gap-2.5 text-slate-700">
          <Clock size={18} className="text-blue-500" />
          <h2 className="font-semibold">Today's Tasks</h2>
        </div>
        {todaysTasks.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-6 text-sm text-slate-400 shadow-sm">
            No tasks due today.
          </div>
        ) : (
          <div className="space-y-2">
            {todaysTasks.map((t) => (
              <button
                key={t.id}
                onClick={onOpenAssignments}
                className="flex w-full items-center justify-between rounded-2xl border border-blue-100 bg-blue-50/50 p-4 text-left transition hover:bg-blue-50"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-800">{t.name}</p>
                  <p className="text-xs text-slate-500">{t.class_name}</p>
                </div>
                <ArrowRight size={16} className="text-slate-400" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Upcoming Tasks */}
      <div className="mt-6">
        <div className="mb-3 flex items-center gap-2.5 text-slate-700">
          <Calendar size={18} className="text-amber-500" />
          <h2 className="font-semibold">Upcoming Tasks</h2>
        </div>
        {upcomingTasks.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-6 text-sm text-slate-400 shadow-sm">
            No upcoming tasks.
          </div>
        ) : (
          <div className="space-y-2">
            {upcomingTasks.map((t) => (
              <button
                key={t.id}
                onClick={onOpenAssignments}
                className="flex w-full items-center justify-between rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm transition hover:shadow-md"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-800">{t.name}</p>
                  <p className="text-xs text-slate-500">
                    {t.class_name}
                    {t.available_from && ` · Available ${formatDateTime(t.available_from)}`}
                  </p>
                </div>
                <ArrowRight size={16} className="text-slate-400" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Recently Completed */}
      <div className="mt-6">
        <div className="mb-3 flex items-center gap-2.5 text-slate-700">
          <CheckCircle size={18} className="text-emerald-500" />
          <h2 className="font-semibold">Recently Completed</h2>
        </div>
        {completedTasks.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-6 text-sm text-slate-400 shadow-sm">
            No completed assignments yet.
          </div>
        ) : (
          <div className="space-y-2">
            {completedTasks.map((t) => (
              <button
                key={t.id}
                onClick={onOpenAssignments}
                className="flex w-full items-center justify-between rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm transition hover:shadow-md"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-800">{t.name}</p>
                  <p className="text-xs text-slate-500">{t.class_name}</p>
                </div>
                <ArrowRight size={16} className="text-slate-400" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8">
        <NotificationsPanel
          recipientId={profile?.id ?? ''}
          onNavigate={(link, state) => onNavigate(link, state)}
        />
      </div>

      <JoinClassModal
        isOpen={joinOpen}
        onClose={() => setJoinOpen(false)}
        onJoined={() => {
          setJoinOpen(false);
          loadData();
        }}
      />
    </div>
  );
}
