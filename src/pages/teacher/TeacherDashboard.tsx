import { useState, useEffect } from 'react';
import { School, Users, BookOpen, TrendingUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface Stats {
  classCount: number;
  studentCount: number;
}

export default function TeacherDashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<Stats>({ classCount: 0, studentCount: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!profile?.teacher_id) return;

      const { data: tcRows } = await supabase
        .from('teacherclasses')
        .select('class_id')
        .eq('teacher_id', profile.teacher_id);

      const allClassIds = (tcRows ?? []).map((r) => r.class_id);

      // Only count active (non-archived) classes in the dashboard summary
      let classIds: number[] = [];
      if (allClassIds.length > 0) {
        const { data: activeRows } = await supabase
          .from('classes')
          .select('id')
          .in('id', allClassIds)
          .is('archived_at', null);
        classIds = (activeRows ?? []).map((r) => r.id);
      }

      let studentCount = 0;
      if (classIds.length > 0) {
        const { count } = await supabase
          .from('classstudents')
          .select('id', { count: 'exact', head: true })
          .in('class_id', classIds);
        studentCount = count ?? 0;
      }

      setStats({ classCount: classIds.length, studentCount });
      setLoading(false);
    }
    load();
  }, [profile?.teacher_id]);

  const cards = [
    {
      label: 'My Classes',
      value: stats.classCount,
      icon: <School size={22} />,
      color: 'bg-blue-50 text-blue-600',
    },
    {
      label: 'Enrolled Students',
      value: stats.studentCount,
      icon: <Users size={22} />,
      color: 'bg-emerald-50 text-emerald-600',
    },
  ];

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Teacher Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Overview of your classes and students.</p>
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
          <h2 className="font-semibold">Quick guide</h2>
        </div>
        <ul className="mt-4 space-y-3 text-sm text-slate-600">
          <li className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
            Go to <strong className="text-slate-800 mx-1">Classes</strong> to create a new class and set a class code.
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
            Share the class code with your students so they can join.
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
            Assignment templates, question bank, and grading are coming in future updates.
          </li>
        </ul>
      </div>
    </div>
  );
}
