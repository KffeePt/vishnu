import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';

const CONFIG_COLLECTION = 'app-config';
const SITE_APPEARANCE_DOC = 'siteAppearance';

export const getConfig = async (docId: string) => {
  const docRef = doc(db, CONFIG_COLLECTION, docId);
  const docSnap = await getDoc(docRef);
  return docSnap.exists() ? docSnap.data() : null;
};

export const setConfig = async (docId: string, data: any) => {
  const docRef = doc(db, CONFIG_COLLECTION, docId);
  await setDoc(docRef, data, { merge: true });
};

export const updateConfig = async (docId: string, data: any) => {
  const docRef = doc(db, CONFIG_COLLECTION, docId);
  await updateDoc(docRef, data);
};

export const getSiteAppearance = async () => {
  return getConfig(SITE_APPEARANCE_DOC);
};

export const setSiteAppearance = async (data: { logoUrl?: string }) => {
  return setConfig(SITE_APPEARANCE_DOC, data);
};