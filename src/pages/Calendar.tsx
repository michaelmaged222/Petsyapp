import { useEffect, useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { logActivity } from '@/lib/activity';
import Modal from '@/components/Modal';
import Badge from '@/components/Badge';
import { toast } from '@/components/Toast';
import type { CalendarEvent } from '@/lib/supabase';

const TYPE_COLORS: Record<string, { dot: string; bg: string; text: string; label: string }> = {
  handover: { dot: 'bg-accent-500', bg: 'bg-accent-500/10', text: 'text-accent-400', label: 'Handover' },
  follow_up: { dot: 'bg-blue-500', bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'Follow-up' },
  overdue: { dot: 'bg-error-500', bg: 'bg-error-500/10', text: 'text-error-400', label: 'Overdue' },
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function CalendarPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: '', type: 'follow_up', date: new Date().toISOString().split('T')[0], notes: '' });

  const fetchEvents = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('calendar_events').select('*').order('date', { ascending: true });
    if (!error) setEvents((data || []) as CalendarEvent[]);
    setLoading(false);
  };

  useEffect(() => { fetchEvents(); }, []);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    return days;
  }, [year, month]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    events.forEach((e) => {
      const dateKey = e.date.split('T')[0];
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(e);
    });
    return map;
  }, [events]);

  const selectedDateEvents = selectedDate ? eventsByDate[selectedDate] || [] : [];

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data, error } = await supabase.from('calendar_events').insert({
      title: form.title,
      type: form.type,
      date: form.date,
      created_by: user?.id,
      notes: form.notes,
    }).select().single();
    if (error) { toast('error', 'Failed to add event'); return; }
    await logActivity('added calendar event', form.title, (data as CalendarEvent).id);
    toast('success', 'Event added');
    setShowAdd(false);
    setForm({ title: '', type: 'follow_up', date: new Date().toISOString().split('T')[0], notes: '' });
    fetchEvents();
  };

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Calendar</h1>
          <p className="text-sm text-gray-500 mt-1">Scheduled handovers, follow-ups, and deadlines</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add Event</button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4">
        {Object.entries(TYPE_COLORS).map(([key, val]) => (
          <div key={key} className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${val.dot}`} />
            <span className="text-sm text-gray-400">{val.label}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">{MONTHS[month]} {year}</h2>
            <div className="flex items-center gap-2">
              <button onClick={prevMonth} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-primary-800 transition-colors"><ChevronLeft className="w-5 h-5" /></button>
              <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-primary-800 transition-colors">Today</button>
              <button onClick={nextMonth} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-primary-800 transition-colors"><ChevronRight className="w-5 h-5" /></button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((day) => (
              <div key={day} className="text-center text-xs font-medium text-gray-500 py-2">{day}</div>
            ))}
            {calendarDays.map((day, i) => {
              if (day === null) return <div key={i} className="aspect-square" />;
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayEvents = eventsByDate[dateStr] || [];
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDate;
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(dateStr)}
                  className={`aspect-square rounded-lg p-1.5 flex flex-col items-center justify-start gap-1 transition-all border ${
                    isSelected ? 'border-accent-500 bg-accent-500/10' :
                    isToday ? 'border-primary-600 bg-primary-800/50' :
                    'border-transparent hover:bg-primary-800/30'
                  }`}
                >
                  <span className={`text-sm ${isToday ? 'text-accent-400 font-bold' : 'text-gray-300'}`}>{day}</span>
                  <div className="flex flex-wrap gap-0.5 justify-center">
                    {dayEvents.slice(0, 3).map((ev) => (
                      <span key={ev.id} className={`w-1.5 h-1.5 rounded-full ${TYPE_COLORS[ev.type].dot}`} />
                    ))}
                    {dayEvents.length > 3 && <span className="text-xs text-gray-500">+</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected date details */}
        <div className="card p-5">
          <h3 className="text-lg font-semibold text-white mb-4">
            {selectedDate ? new Date(selectedDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : 'Select a date'}
          </h3>
          {selectedDateEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CalendarIcon className="w-10 h-10 text-gray-700 mb-3" />
              <p className="text-sm text-gray-500">No events on this date</p>
            </div>
          ) : (
            <div className="space-y-3">
              {selectedDateEvents.map((event) => {
                const color = TYPE_COLORS[event.type];
                return (
                  <div key={event.id} className={`p-3 rounded-lg border ${color.bg} border-l-2`} style={{ borderLeftColor: event.type === 'handover' ? '#1aa853' : event.type === 'follow_up' ? '#3b82f6' : '#ef4444' }}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-white">{event.title}</p>
                        {event.notes && <p className="text-xs text-gray-500 mt-1">{event.notes}</p>}
                      </div>
                      <Badge variant={event.type === 'handover' ? 'success' : event.type === 'follow_up' ? 'info' : 'error'}>
                        {color.label}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Add Event Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Calendar Event" size="md">
        <form onSubmit={handleAdd} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Event Title *</label>
            <input type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input" placeholder="e.g. Handover — Golden Retriever" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Type</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="select">
              <option value="handover">Handover (Green)</option>
              <option value="follow_up">Follow-up (Blue)</option>
              <option value="overdue">Overdue (Red)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Date *</label>
            <input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input min-h-[80px]" placeholder="Additional notes..." />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowAdd(false)} className="btn-ghost">Cancel</button>
            <button type="submit" className="btn-primary"><Plus className="w-4 h-4" /> Add Event</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
