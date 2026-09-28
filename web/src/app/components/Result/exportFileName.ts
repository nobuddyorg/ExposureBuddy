const EXPORT_PREFIX = 'exposurebuddy';

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

/** `exposurebuddy-2026-09-28-1432.jpg` for `date`, in local time, so files sort by when they were saved. */
export function exportFileName(date: Date): string {
  const day = [
    date.getFullYear(),
    twoDigits(date.getMonth() + 1),
    twoDigits(date.getDate()),
  ].join('-');
  const time = `${twoDigits(date.getHours())}${twoDigits(date.getMinutes())}`;
  return `${EXPORT_PREFIX}-${day}-${time}.jpg`;
}
