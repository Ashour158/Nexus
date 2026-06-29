export type HijriDate = {
  day: number;
  month: number;
  year: number;
  monthName: string;
  monthNameAr: string;
  formatted: string;
  formattedAr: string;
};

const HIJRI_MONTH_NAMES_EN = [
  'Muharram',
  'Safar',
  "Rabi' al-Awwal",
  "Rabi' al-Thani",
  'Jumada al-Awwal',
  'Jumada al-Thani',
  'Rajab',
  "Sha'ban",
  'Ramadan',
  'Shawwal',
  "Dhu al-Qi'dah",
  'Dhu al-Hijjah',
];

const HIJRI_MONTH_NAMES_AR = [
  'محرم',
  'صفر',
  'ربيع الأول',
  'ربيع الآخر',
  'جمادى الأولى',
  'جمادى الآخرة',
  'رجب',
  'شعبان',
  'رمضان',
  'شوال',
  'ذو القعدة',
  'ذو الحجة',
];

function toArabicNumerals(num: number): string {
  const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return String(num)
    .split('')
    .map((d) => arabicNumerals[parseInt(d, 10)] ?? d)
    .join('');
}

/** Tabular Hijri approximation from Gregorian (`Date` UTC components). */
export function gregorianToHijri(date: Date): HijriDate {
  const jd = Math.floor(date.getTime() / 86400000 + 2440587.5);

  const l = jd - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  const l2 = l - 10631 * n + 354;
  const j =
    Math.floor((10985 - l2) / 5316) * Math.floor((50 * l2) / 17719) +
    Math.floor(l2 / 5670) * Math.floor((43 * l2) / 15238);
  const l3 =
    l2 -
    Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
    Math.floor(j / 16) * Math.floor((15238 * j) / 43) +
    29;
  let month = Math.floor((24 * l3) / 709);
  const day = l3 - Math.floor((709 * month) / 24);
  const year = 30 * n + j - 30;
  month = Math.min(Math.max(month, 1), 12);
  const monthIdx = month - 1;
  const monthName = HIJRI_MONTH_NAMES_EN[monthIdx] ?? '';
  const monthNameAr = HIJRI_MONTH_NAMES_AR[monthIdx] ?? '';

  return {
    day,
    month,
    year,
    monthName,
    monthNameAr,
    formatted: `${day} ${monthName} ${year}`,
    formattedAr: `${toArabicNumerals(day)} ${monthNameAr} ${toArabicNumerals(year)}`,
  };
}

export function formatDualDate(
  date: Date | string,
  _locale?: string
): { gregorian: string; hijri: HijriDate } {
  const d = typeof date === 'string' ? new Date(date) : date;
  return {
    gregorian: d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }),
    hijri: gregorianToHijri(d),
  };
}
