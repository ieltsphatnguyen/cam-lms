import { ClipboardList } from 'lucide-react';
import ComingSoonPage from './ComingSoonPage';

export default function TeacherAssignmentsPage() {
  return (
    <ComingSoonPage
      title="Assignments"
      description="Assign work to your classes and track submissions."
      icon={<ClipboardList size={28} />}
    />
  );
}
