import { Users } from 'lucide-react';
import ComingSoonPage from './ComingSoonPage';

export default function TeacherStudentsPage() {
  return (
    <ComingSoonPage
      title="Students"
      description="View and manage students across your classes."
      icon={<Users size={28} />}
    />
  );
}
