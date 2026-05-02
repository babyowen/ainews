import dayjs from 'dayjs';

export function getRecentCompleteSaturdayRange(referenceDate = dayjs()) {
  const ref = dayjs(referenceDate).startOf('day');
  const day = ref.day();
  const daysSinceSaturday = (day + 1) % 7;
  const currentSaturday = ref.subtract(daysSinceSaturday, 'day');
  const end = day === 6 ? currentSaturday : currentSaturday.subtract(7, 'day');
  const start = end.subtract(7, 'day');

  return {
    startDate: start.format('YYYY-MM-DD'),
    endDate: end.format('YYYY-MM-DD')
  };
}
