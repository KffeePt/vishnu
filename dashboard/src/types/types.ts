import { Timestamp } from 'firebase/firestore';

export interface UserProfile {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
  role?: 'patient' | 'doctor' | 'admin';
}

export interface Appointment {
  id: string;
  doctorId: string;
  patientId: string;
  date: Timestamp;
  time: string;
  status: 'scheduled' | 'completed' | 'cancelled';
}