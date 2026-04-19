export const ROLES = {
  ADMIN: 'admin',
  DOCTOR: 'doctor',
  PATIENT: 'patient',
};

export const PERMISSIONS = {
  MANAGE_USERS: 'manage_users',
  VIEW_PATIENTS: 'view_patients',
  SCHEDULE_APPOINTMENTS: 'schedule_appointments',
};

export const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: [PERMISSIONS.MANAGE_USERS],
  [ROLES.DOCTOR]: [PERMISSIONS.VIEW_PATIENTS],
  [ROLES.PATIENT]: [PERMISSIONS.SCHEDULE_APPOINTMENTS],
};