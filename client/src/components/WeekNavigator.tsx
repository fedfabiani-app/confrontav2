import { ChevronLeft, ChevronRight, Lock, CalendarDays } from 'lucide-react';

interface WeekNavigatorProps {
  weekOffset: number;
  onOffsetChange: (offset: number) => void;
  maxWeeksBack: number;
}

const MONTHS_IT = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];

function getMondayOfWeek(offsetWeeks: number): Date {
  const today = new Date();
  const day = today.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday - offsetWeeks * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function formatWeekRange(offsetWeeks: number): string {
  const monday = getMondayOfWeek(offsetWeeks);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const monDay = monday.getDate();
  const sunDay = sunday.getDate();
  const monMonth = MONTHS_IT[monday.getMonth()];
  const sunMonth = MONTHS_IT[sunday.getMonth()];

  if (monday.getMonth() === sunday.getMonth()) {
    return `${monDay} - ${sunDay} ${sunMonth}`;
  }
  return `${monDay} ${monMonth} - ${sunDay} ${sunMonth}`;
}

export function WeekNavigator({ weekOffset, onOffsetChange, maxWeeksBack }: WeekNavigatorProps) {
  const backLocked = weekOffset >= maxWeeksBack;
  const forwardDisabled = weekOffset === 0;

  return (
    <div className="flex items-center justify-between gap-6 bg-indigo-950 border border-indigo-800 rounded-full px-4 py-3 shadow-md">
      {/* Freccia indietro */}
      <button
        onClick={() => !backLocked && onOffsetChange(weekOffset + 1)}
        className={`p-1 rounded-full transition-colors flex-shrink-0 ${backLocked ? 'opacity-40 cursor-not-allowed' : 'hover:bg-indigo-800'}`}
        aria-label="Settimana precedente"
      >
        {backLocked && maxWeeksBack > 0 ? (
          <Lock size={24} className="text-indigo-400/50" />
        ) : (
          <ChevronLeft size={24} className="text-indigo-100" />
        )}
      </button>

      {/* Centro: icona calendario + testo */}
      <div className="flex items-center justify-center gap-3">
        <CalendarDays className="w-5 h-5 text-[var(--header-gold)] flex-shrink-0" />
        <span className="text-indigo-100 text-base font-semibold tabular-nums select-none">
          Settimana del {formatWeekRange(weekOffset)}
        </span>
      </div>

      {/* Freccia avanti */}
      <button
        onClick={() => !forwardDisabled && onOffsetChange(weekOffset - 1)}
        className={`p-1 rounded-full transition-colors flex-shrink-0 ${forwardDisabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-indigo-800'}`}
        aria-label="Settimana successiva"
        disabled={forwardDisabled}
      >
        <ChevronRight size={24} className="text-indigo-100" />
      </button>
    </div>
  );
}