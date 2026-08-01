import { ReactNode } from 'react';

interface Props {
  title: string;
  description: string;
  icon: ReactNode;
}

export default function ComingSoonPage({ title, description, icon }: Props) {
  return (
    <div className="p-6 md:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>

      <div className="flex h-72 flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-slate-200 bg-white text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          {icon}
        </div>
        <div>
          <p className="text-lg font-semibold text-slate-700">Coming Soon</p>
          <p className="mt-1 text-sm text-slate-400">
            This module is part of the upcoming roadmap.
          </p>
        </div>
      </div>
    </div>
  );
}
