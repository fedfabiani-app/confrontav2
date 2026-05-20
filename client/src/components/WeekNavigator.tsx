import { ChevronLeft, ChevronRight, Lock } from 'lucide-react';

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
  const year = sunday.getFullYear();

  if (monday.getMonth() === sunday.getMonth()) {
    return `${monDay} - ${sunDay} ${sunMonth} ${year}`;
  }
  return `${monDay} ${monMonth} - ${sunDay} ${sunMonth} ${year}`;
}

export function WeekNavigator({ weekOffset, onOffsetChange, maxWeeksBack }: WeekNavigatorProps) {
  const backLocked = weekOffset >= maxWeeksBack;
  const forwardDisabled = weekOffset === 0;

  return (
    <div className="flex items-center justify-between gap-2">
      {/* Freccia indietro */}
      <button
        onClick={() => !backLocked && onOffsetChange(weekOffset + 1)}
        className={`p-1.5 rounded-full transition-colors ${backLocked ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/10'}`}
        aria-label="Settimana precedente"
      >
        {backLocked && maxWeeksBack > 0 ? (
          <Lock size={16} className="text-white/50" />
        ) : (
          <ChevronLeft size={20} className="text-white" />
        )}
      </button>

      {/* Label settimana */}
      <span className="text-white text-sm font-medium tabular-nums select-none">
        {formatWeekRange(weekOffset)}
      </span>

      {/* Freccia avanti */}
      <button
        onClick={() => !forwardDisabled && onOffsetChange(weekOffset - 1)}
        className={`p-1.5 rounded-full transition-colors ${forwardDisabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/10'}`}
        aria-label="Settimana successiva"
        disabled={forwardDisabled}
      >
        <ChevronRight size={20} className="text-white" />
      </button>
    </div>
  );
}
