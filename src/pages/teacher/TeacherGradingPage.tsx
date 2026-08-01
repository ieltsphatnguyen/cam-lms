import { CheckSquare } from 'lucide-react';
import ComingSoonPage from './ComingSoonPage';

export default function TeacherGradingPage() {
  return (
    <ComingSoonPage
      title="Grading"
      description="Review and grade student submissions."
      icon={<CheckSquare size={28} />}
    />
  );
}
