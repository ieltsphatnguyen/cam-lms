import { useState, useEffect } from 'react';
import { School, BookOpen, TrendingUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import JoinClassModal from './JoinClassModal';
import Button from '@/components/ui/Button';
import { Plus } from 'lucide-react';

interface Stats {
  classCount: number;
}

export default function StudentDashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<Stats>({ classCount: 0 });
  const [loading, setLoading] = useState(true);
  const [joinOpen, setJoinOpen] = useState(false);

  async function loadStats() {
    if (!profile?.student_id) return;
    const { data: enrollments } = await supabase
      .from('classstudents')
      .select('class_id, classes!inner(archived_at)')
      .eq('student_id', profile.student_id);

    const activeCount = (enrollments ?? []).filter(
      (e) => (e.classes as { archived_at: string | null }).archived_at === null
    ).length;

    setStats({ classCount: activeCount });
    setLoading(false);
  }

  useEffect(() => {
    loadStats();
  }, [profile?.student_id]);

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
            Welcome back! Here's an overview of your classes.
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
                  {loading ? '—' : c.value.toLocaleString()}
                </p>
              </div>
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${c.color}`}>
                {c.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2.5 text-slate-700">
          <TrendingUp size={18} />
          <h2 className="font-semibold">Getting started</h2>
        </div>
        <ul className="mt-4 space-y-3 text-sm text-slate-600">
          <li className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
            Click <strong className="text-slate-800 mx-1">Join a Class</strong> and enter the code your teacher gave you.
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
            Go to <strong className="text-slate-800 mx-1">My Classes</strong> in the sidebar to see all your enrolled classes.
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
            Assignments and grades will appear here once your teacher publishes them.
          </li>
        </ul>
      </div>

      <JoinClassModal
        isOpen={joinOpen}
        onClose={() => setJoinOpen(false)}
        onJoined={() => {
          setJoinOpen(false);
          loadStats();
        }}
      />
    </div>
  );
}
