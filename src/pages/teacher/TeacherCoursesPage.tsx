import { BookOpen } from 'lucide-react';
import ComingSoonPage from './ComingSoonPage';

export default function TeacherCoursesPage() {
  return (
    <ComingSoonPage
      title="Courses"
      description="Build and organize your course materials."
      icon={<BookOpen size={28} />}
    />
  );
}
