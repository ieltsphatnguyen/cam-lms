import { useState, useEffect } from 'react';
import { Users, School, BookOpen, TrendingUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Stats {
  teacherCount: number;
  studentCount: number;
  classCount: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({ teacherCount: 0, studentCount: 0, classCount: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ count: tc }, { count: sc }, { count: cc }] = await Promise.all([
        supabase.from('teachers').select('id', { count: 'exact', head: true }),
        supabase.from('students').select('id', { count: 'exact', head: true }),
        supabase.from('classes').select('id', { count: 'exact', head: true }),
      ]);
      setStats({
        teacherCount: tc ?? 0,
        studentCount: sc ?? 0,
        classCount: cc ?? 0,
      });
      setLoading(false);
    }
    load();
  }, []);

  const cards = [
    { label: 'Teachers', value: stats.teacherCount, icon: <Users size={22} />, color: 'bg-blue-50 text-blue-600' },
    { label: 'Students', value: stats.studentCount, icon: <BookOpen size={22} />, color: 'bg-emerald-50 text-emerald-600' },
    { label: 'Classes', value: stats.classCount, icon: <School size={22} />, color: 'bg-amber-50 text-amber-600' },
  ];

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">System overview at a glance.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
            Go to <strong className="text-slate-800 mx-1">Teachers</strong> in the sidebar to add teacher accounts.
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
            Teachers can then log in and create classes for their students.
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
            Students register on the login page and join classes using a class code.
          </li>
        </ul>
      </div>
    </div>
  );
}
