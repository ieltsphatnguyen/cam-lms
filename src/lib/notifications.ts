import { supabase } from '@/lib/supabase';
import type { AppNotification } from '@/types/database';

export async function fetchNotifications(recipientId: string): Promise<AppNotification[]> {
  const { data, error } = await supabase.rpc('get_notifications', {
    p_recipient_id: recipientId,
  });
  if (error) throw error;
  return (data ?? []) as unknown as AppNotification[];
}

export async function markNotificationRead(notificationId: number): Promise<void> {
  const { error } = await supabase.rpc('mark_notification_read', {
    p_notification_id: notificationId,
  });
  if (error) throw error;
}

export async function markAllNotificationsRead(recipientId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_all_notifications_read', {
    p_recipient_id: recipientId,
  });
  if (error) throw error;
}

export async function notifyTeacherOfSubmission(attemptId: number): Promise<void> {
  const { error } = await supabase.rpc('notify_teacher_of_submission', {
    p_attempt_id: attemptId,
  });
  if (error) throw error;
}
