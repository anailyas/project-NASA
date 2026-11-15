export const astronaut = {
  id: 'DEMO-AST-001',
  name: 'Avery Quinn',
  role: 'Mission specialist (scenario)',
};

export const mission = {
  id: 'AETHER-7',
  name: 'AETHER-7',
  title: 'Fictional low Earth orbit scenario',
  status: 'Scenario active',
  phase: 'Low Earth orbit cruise',
  duration: 'Day 46 of 180 on the scenario clock',
  clock: '2026-11-14T18:00:00.000Z',
  phases: [
    { id: 'pre', name: 'Pre-flight baseline', window: 'L-90 to L-1', state: 'complete' },
    { id: 'launch', name: 'Launch and ascent', window: 'Day 0', state: 'complete' },
    { id: 'cruise', name: 'Low Earth orbit cruise', window: 'Day 1–120', state: 'current' },
    { id: 'eva', name: 'EVA window', window: 'Day 121–130', state: 'upcoming' },
    { id: 'return', name: 'Return and recovery', window: 'Day 175–180', state: 'upcoming' },
  ],
};

export const PROFILE_FACTS = [
  ['Astronaut ID', astronaut.id],
  ['Name', astronaut.name],
  ['Identity', 'Fictional demonstration profile'],
  ['Role', astronaut.role],
  ['Mission', mission.id],
  ['Mission information', mission.title],
  ['Mission duration', mission.duration],
  ['Mission phase', mission.phase],
  ['Blood type', 'Not provided'],
  ['Date of birth', 'Not provided'],
];
