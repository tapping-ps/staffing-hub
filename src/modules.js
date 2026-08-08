// The hub's module registry. One entry per tile on the home screen.
// status: 'live' (usable now) | 'building' (being built next) | 'planned'
// When a module goes live, give it a `path` and add its screen to App.jsx.

export const MODULES = [
  {
    key: 'timetable',
    name: 'Semester 2 Timetables',
    description:
      'The Semester 2 timetable: whole school, class and teacher views. Admin editing to follow.',
    status: 'live',
    href: './timetable/',
  },
  {
    key: 'dott',
    name: 'DOTT Tracker',
    description:
      'Every teacher\'s DOTT baseline straight from the timetable, plus the lost-and-gained ledger.',
    status: 'live',
    href: '#/dott',
  },
  {
    key: 'ea',
    name: 'EA Timetables',
    description:
      'Education assistant timetables. Staff names and times only.',
    status: 'planned',
  },
  {
    key: 'duty',
    name: 'Duty Roster',
    description:
      'Duty areas, times and swaps across the week.',
    status: 'planned',
  },
  {
    key: 'relief',
    name: 'Relief Planner',
    description:
      'Plan leave in advance and record the relief teacher beside each absence; full coverage management to follow.',
    status: 'building',
    href: '#/relief',
  },
]

export const STATUS_LABELS = {
  live: 'Live',
  building: 'In build',
  planned: 'Planned',
}
