// The hub's module registry. One entry per tile on the home screen.
// status: 'live' (usable now) | 'building' (being built next) | 'planned'
// When a module goes live, give it a `path` and add its screen to App.jsx.

export const MODULES = [
  {
    key: 'timetable',
    name: 'Specialist Timetable',
    description:
      'The Semester 2 timetable: whole school, class and teacher views. Admin editing to follow.',
    status: 'live',
    href: './timetable/',
  },
  {
    key: 'dott',
    name: 'DOTT Tracker',
    description:
      'DOTT and leadership time tracking, shared live across the admin team.',
    status: 'building',
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
    name: 'Relief Days',
    description:
      'Mark an absence, see affected classes, DOTT and duties, and confirm coverage.',
    status: 'planned',
  },
]

export const STATUS_LABELS = {
  live: 'Live',
  building: 'In build',
  planned: 'Planned',
}
