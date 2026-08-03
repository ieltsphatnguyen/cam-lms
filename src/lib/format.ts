export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${MM}/${yyyy}`;
}

export function formatTime(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function formatDateTime(date: string | Date | null | undefined): string {
  const d = formatDate(date);
  const t = formatTime(date);
  if (!d) return '';
  return t ? `${d} ${t}` : d;
}

export function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (s === 0) return `${m} min`;
  return `${m} min ${s} sec`;
}

export function formatTimeLimit(intervalStr: string | null): string | null {
  if (!intervalStr) return null;
  const hmsMatch = intervalStr.match(/^(\d{2}):(\d{2}):(\d{2})/);
  if (hmsMatch) {
    const h = parseInt(hmsMatch[1], 10);
    const m = parseInt(hmsMatch[2], 10);
    const s = parseInt(hmsMatch[3], 10);
    const totalSeconds = h * 3600 + m * 60 + s;
    if (totalSeconds === 0) return null;
    return formatSeconds(totalSeconds);
  }
  return intervalStr;
}
