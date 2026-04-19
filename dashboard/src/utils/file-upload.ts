import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { app } from '@/config/firebase';

const storage = getStorage(app);

/**
 * Uploads a file to Firebase Storage and returns the download URL.
 * @param file The file to upload.
 * @param path The path in Firebase Storage where the file will be stored.
 * @returns The public URL of the uploaded file.
 */
export const uploadFile = async (file: File, path: string): Promise<string> => {
  try {
    const storageRef = ref(storage, `${path}/${file.name}`);
    const snapshot = await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);
    return downloadURL;
  } catch (error) {
    console.error("Error uploading file:", error);
    // Re-throw the error to be handled by the caller
    throw error;
  }
};