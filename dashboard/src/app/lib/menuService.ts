import { db } from '@/config/firebase'; // Assuming firebase config is here
import { collection, addDoc, getDocs, query, where, Timestamp, serverTimestamp, orderBy, limit, doc, updateDoc, deleteDoc } from 'firebase/firestore'; // Added doc, updateDoc, and deleteDoc

export interface MenuItem {
  id?: string; // Optional: Firestore document ID
  date: Timestamp;
  entrada: string;
  sopa: string;
  platoFuerte: string;
  aguaDelDia: string;
  title?: string; // Optional: Add title field
  price?: number; // Optional: Add price field
  createdAt?: Timestamp; // Optional: Server timestamp
  image?: string; // Optional: Add image URL
}

export interface DishOption {
  id?: string;
  name: string;
  category: 'entrada' | 'sopa' | 'platoFuerte' | 'aguaDelDia';
  createdAt?: Timestamp;
}

// --- Service Functions for Dish Options ---

// Function to create a new dish option
export const createDishOption = async (dishData: Omit<DishOption, 'id' | 'createdAt'>): Promise<string> => {
  try {
    const dishCollection = collection(db, 'dishOptions');
    const docRef = await addDoc(dishCollection, {
      ...dishData,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error("Error creating dish option: ", error);
    throw new Error("Failed to create dish option.");
  }
};

// Function to get all dish options for a specific category
export const getDishOptions = async (category: DishOption['category']): Promise<DishOption[]> => {
  try {
    const dishCollection = collection(db, 'dishOptions');
    const q = query(
      dishCollection,
      where('category', '==', category),
      orderBy('name', 'asc')
    );
    const querySnapshot = await getDocs(q);
    const options: DishOption[] = [];
    querySnapshot.forEach((doc) => {
      options.push({ id: doc.id, ...doc.data() } as DishOption);
    });
    return options;
  } catch (error) {
    console.error(`Error fetching ${category} options: `, error);
    throw new Error(`Failed to fetch ${category} options.`);
  }
};

// Function to get all dish options, grouped by category
export const getAllDishOptions = async (): Promise<DishOption[]> => {
  try {
    const dishCollection = collection(db, 'dishOptions');
    const q = query(
      dishCollection,
      orderBy('category', 'asc'),
      orderBy('name', 'asc')
    );
    const querySnapshot = await getDocs(q);
    const options: DishOption[] = [];
    querySnapshot.forEach((doc) => {
      options.push({ id: doc.id, ...doc.data() } as DishOption);
    });
    return options;
  } catch (error) {
    console.error(`Error fetching all dish options: `, error);
    throw new Error(`Failed to fetch all dish options.`);
  }
};
// Function to update a dish option
export const updateDishOption = async (id: string, name: string): Promise<void> => {
  try {
    const dishDocRef = doc(db, 'dishOptions', id);
    await updateDoc(dishDocRef, { name });
  } catch (error) {
    console.error("Error updating dish option: ", error);
    throw new Error("Failed to update dish option.");
  }
};

// Function to delete a dish option
export const deleteDishOption = async (id: string): Promise<void> => {
  try {
    const dishDocRef = doc(db, 'dishOptions', id);
    await deleteDoc(dishDocRef);
  } catch (error) {
    console.error("Error deleting dish option: ", error);
    throw new Error("Failed to delete dish option.");
  }
};


// Function for Admins to create a new menu
// Update the type to include the optional title, price, and image
export const createMenu = async (menuData: Omit<MenuItem, 'id' | 'createdAt' | 'date'> & { date: Date; title?: string; price?: number; image?: string }): Promise<string> => {
  try {
    const menuCollection = collection(db, 'menus');
    const dataToSave: any = {
      ...menuData,
      price: menuData.price ?? 99,
      date: Timestamp.fromDate(menuData.date),
      createdAt: serverTimestamp(),
    };
    if (menuData.image) {
      dataToSave.image = menuData.image;
    }
    const docRef = await addDoc(menuCollection, dataToSave);
    console.log("Menu created with ID: ", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error("Error creating menu: ", error);
    throw new Error("Failed to create menu.");
  }
};

// Function for Users to get available menus (e.g., today's menu)
export const getTodaysMenu = async (): Promise<MenuItem | null> => {
  try {
    const menuCollection = collection(db, 'menus');
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1); // Start of tomorrow

    const q = query(
      menuCollection,
      where('date', '>=', Timestamp.fromDate(today)),
      where('date', '<', Timestamp.fromDate(tomorrow)),
      orderBy('date', 'desc'), // Get the latest one if multiple exist for today
      limit(1)
    );

    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      return { id: doc.id, ...doc.data() } as MenuItem;
    } else {
      console.log("No menu found for today.");
      return null;
    }
  } catch (error) {
    console.error("Error fetching today's menu: ", error);
    throw new Error("Failed to fetch today's menu.");
  }
};

// Function to get all menus (potentially for admin view or future use)
export const getAllMenus = async (): Promise<MenuItem[]> => {
  try {
    const menuCollection = collection(db, 'menus');
    const q = query(menuCollection, orderBy('date', 'desc')); // Order by date descending
    const querySnapshot = await getDocs(q);
    const menus: MenuItem[] = [];
    querySnapshot.forEach((doc) => {
      menus.push({ id: doc.id, ...doc.data() } as MenuItem);
    });
    return menus;
  } catch (error) {
    console.error("Error fetching all menus: ", error);
    throw new Error("Failed to fetch menus.");
  }
};

// Function for Admins to delete an existing menu
export const deleteMenu = async (id: string): Promise<void> => {
  try {
    const menuDocRef = doc(db, 'menus', id);
    await deleteDoc(menuDocRef);
    console.log("Menu deleted with ID: ", id);
  } catch (error) {
    console.error("Error deleting menu: ", error);
    throw new Error("Failed to delete menu.");
  }
};
// Function for Admins to update an existing menu
// Update the type to include the optional title, price, and image
export const updateMenu = async (id: string, menuData: Omit<MenuItem, 'id' | 'createdAt' | 'date'> & { date: Date; title?: string; price?: number; image?: string }): Promise<void> => {
  try {
    const menuDocRef = doc(db, 'menus', id);
    const dataToUpdate: any = {
      ...menuData,
      price: menuData.price ?? 99,
      date: Timestamp.fromDate(menuData.date),
    };
    if (menuData.image) {
      dataToUpdate.image = menuData.image;
    } else {
      // If image is explicitly passed as undefined or null, consider removing it
      // For now, we'll only add/update it if present. To remove, you might need a specific flag or FieldValue.delete()
    }
    await updateDoc(menuDocRef, dataToUpdate);
    console.log("Menu updated with ID: ", id);
  } catch (error) {
    console.error("Error updating menu: ", error);
    throw new Error("Failed to update menu.");
  }
};
