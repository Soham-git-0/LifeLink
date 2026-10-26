export const stats = [
  { label: 'Available Blood Units', value: 128, icon: '🩸', tone: 'red' },
  { label: 'Viable Organs', value: 7, icon: '🫀', tone: 'teal' },
  { label: 'Pending Requests', value: 14, icon: '📋', tone: 'amber' },
  { label: 'Matches Today', value: 9, icon: '✓', tone: 'green' },
];

export const recentMatches = [
  { id: 'REQ-1042', type: 'Blood', compatibility: 'ABO + Rh', status: 'Reserved', tone: 'green' },
  { id: 'REQ-1041', type: 'Organ', compatibility: 'HLA + urgency', status: 'Ranked', tone: 'teal' },
  { id: 'REQ-1039', type: 'Blood', compatibility: 'ABO + Rh', status: 'Cross-branch', tone: 'amber' },
];

export const bloodUnits = [
  { id: 'BU-2048', group: 'O', rh: '+', hospital: 'Central Branch', collected: '18 Sep 2026', expiry: '16 Nov 2026', status: 'Available' },
  { id: 'BU-2049', group: 'A', rh: '+', hospital: 'North Branch', collected: '20 Sep 2026', expiry: '18 Nov 2026', status: 'Available' },
  { id: 'BU-2050', group: 'B', rh: '-', hospital: 'Central Branch', collected: '15 Sep 2026', expiry: '13 Nov 2026', status: 'Reserved' },
  { id: 'BU-2051', group: 'AB', rh: '+', hospital: 'East Branch', collected: '12 Sep 2026', expiry: '10 Nov 2026', status: 'Low Stock' },
];

export const organs = [
  { id: 'ORG-071', type: 'Kidney', blood: 'O+', hla: 'High', hospital: 'Central Branch', viability: '38 hrs', status: 'Available' },
  { id: 'ORG-072', type: 'Liver', blood: 'A+', hla: 'Medium', hospital: 'North Branch', viability: '22 hrs', status: 'Available' },
  { id: 'ORG-073', type: 'Heart', blood: 'B+', hla: 'High', hospital: 'East Branch', viability: '4 hrs', status: 'Priority' },
];

export const requests = [
  { id: 'REQ-1042', patient: 'Recipient R-018', type: 'Blood', detail: 'O+', hospital: 'Central Branch', urgency: 'High', status: 'Matched' },
  { id: 'REQ-1041', patient: 'Recipient R-024', type: 'Organ', detail: 'Kidney · HLA High', hospital: 'North Branch', urgency: 'Critical', status: 'Ranking' },
  { id: 'REQ-1040', patient: 'Recipient R-031', type: 'Blood', detail: 'A-', hospital: 'East Branch', urgency: 'Medium', status: 'Pending' },
];
