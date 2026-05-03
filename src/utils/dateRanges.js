import dayjs from 'dayjs';

export function getRecentCompleteSaturdayRange(referenceDate = dayjs()) {
  const ref = dayjs(referenceDate).startOf('day');
  const day = ref.day(); // 0=周日, 1=周一, ..., 6=周六
  const daysSinceSaturday = (day + 1) % 7;
  const daysToSubtract = daysSinceSaturday === 0 ? 7 : daysSinceSaturday;

  const start = ref.subtract(daysToSubtract, 'day');
  const end = ref;

  return {
    startDate: start.format('YYYY-MM-DD'),
    endDate: end.format('YYYY-MM-DD')
  };
}
