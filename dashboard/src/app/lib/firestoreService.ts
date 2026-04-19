import { db } from "@/config/firebase";
import { 
  collection, 
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  DocumentData,
  QueryDocumentSnapshot,
  QuerySnapshot, // Added QuerySnapshot
  Timestamp,
  runTransaction, // Added for atomic operations
  GeoPoint // Import GeoPoint
} from "firebase/firestore";

// Types

// Delivery Zone Interface (matches DeliveryZoneState in menu-card.tsx)
export interface DeliveryZone {
  id: string;
  name: string;
  center: { lat: number; lng: number };
  radius: number;
  // Add other fields if necessary, e.g., color, isActive
}

export interface UserProfile {
  id: string; // Firestore document ID
  email: string;
  name?: string; // Optional name
  image?: string; // Optional image URL
  hashedPassword?: string; // Password hash (only for email/password users)
  role?: string; // Add role field
  // Add other user fields as needed (e.g., createdAt)
}

export interface OrderItemDetails {
  id: string; // Menu item's own ID
  name: string;
  price: number;
  quantity: number;
  // Optional fields from screenshot
  aguaDelDia?: string;
  entrada?: string;
  platoFuerte?: string;
  sopa?: string;
  image?: string; // Keep as optional
}

export interface OrderItem { // This is an element of the 'items' array in Firestore
  details: OrderItemDetails;
  // The 'orderId' field seen in the screenshot for items[0].orderId seems redundant
  // if this OrderItem is part of an OrderData object which already has an orderId.
  // However, if it's present in the DB, the type should reflect it.
  orderId?: string; // The parent order's ID, as seen in the screenshot.
}

export interface DeliveryInfo {
  nombre: string;
  direccion: string;
  codigoPostal: string;
  numeroCelular: string;
  direccionesEntrega: string;
}

export interface DeliveryDateTime {
  fecha: Date | null;
  hora: string;
}

export type OrderStatusType = "active" | "cancelled" | "completed" | "error";

// New interface for the complex status object observed in logs
export interface OrderStatusObject {
  progress?: number;
  updatedAt?: Timestamp; // Assuming it's a Firestore Timestamp
  estimatedTime?: number;
  orderStatus: string; // e.g., "confirmed", "preparing", "on_the_way", "delivered"
  // Add other potential fields if they exist in this object structure
}

export interface OrderData {
  orderId: string;
  items: OrderItem[];
  deliveryInfo: DeliveryInfo;
  deliveryDateTime: DeliveryDateTime;
  paymentMethod: string;
  totalAmount: number;
  timestamp: Timestamp | null;
  restaurantId: string;
  userId: string;
  status: OrderStatusType | OrderStatusObject; // Status can be a string or the complex object
  deliveryAddress?: string; // Optional, to acknowledge potential presence in raw Firestore data
  // Optional fields that might exist on an order
  orderNumber?: string;
  specialInstructions?: string;
  appliedPromoCode?: string;
  deliveryFee?: number;
  serviceFee?: number;
  estimatedDeliveryTime?: Timestamp;
  actualDeliveryTime?: Timestamp;
  preparationTime?: number; // e.g., in minutes
  feedback?: {
    rating?: number;
    comment?: string;
  };
  invoiceUrl?: string;
  paymentDetails?: { // For more detailed payment info if needed
    transactionId?: string;
    status?: string; // e.g., "paid", "pending", "failed"
    gateway?: string; // e.g., "stripe", "mercadopago"
    [key: string]: any; // For other gateway-specific details
  };
}

/**
 * Creates a new order in Firestore
 * @param orderData Order data to be stored, may include optional paymentDetails and initialStatus
 * @returns The created order ID
 */
export const createOrder = async (orderData: Omit<OrderData, 'timestamp' | 'status'> & { paymentDetails?: Record<string, any>, initialStatus?: Record<string, any> }): Promise<string> => {
  // orderId is now guaranteed to be provided by the calling service (orderService.ts)
  const orderId = orderData.orderId;
  const orderRef = doc(db, "orders", orderId);
  const ordersCollectionRef = collection(db, "orders");

  try {
    // 1. Perform the check for existing active orders *before* the transaction
    const activeOrderQuery = query(
      ordersCollectionRef,
      where("userId", "==", orderData.userId),
      // Assuming 'active' is a string status. If it's an object, this query needs adjustment.
      // For OrderStatusObject, it might be where("status.orderStatus", "==", "active_or_confirmed_etc")
      where("status", "==", "active") 
    );
    
    const activeOrderQuerySnapshot = await getDocs(activeOrderQuery);

    if (!activeOrderQuerySnapshot.empty) {
      // If an active order exists, throw an error.
      throw new Error(`User ${orderData.userId} already has an active order. Please complete or cancel it before placing a new one.`);
    }

    // 2. If no active order, proceed to create the new order document within a transaction
    //    The transaction now only handles the write, making it simpler.
    await runTransaction(db, async (transaction) => {
      const dataToSet: any = {
        ...orderData, // Contains all necessary fields including the specific orderId
        status: orderData.initialStatus || ("active" as OrderStatusType), // Use initialStatus if provided, else default
        timestamp: serverTimestamp(), // Add server-side timestamp
      };

      if (orderData.paymentDetails) {
        dataToSet.paymentDetails = orderData.paymentDetails; // Add paymentDetails if provided
      }
      
      // Remove initialStatus from dataToSet as it's now part of the main status field or handled
      delete dataToSet.initialStatus; 

      transaction.set(orderRef, dataToSet);
    });
    
    return orderId; // Return the orderId on successful transaction
  } catch (error: any) {
    // Log the error and re-throw it to be handled by the caller
    console.error(`Error during Firestore order creation transaction for orderId ${orderId}:`, error.message);
    // Ensure the original error (especially the custom "active order exists" one) is propagated
    throw error;
  }
};

/**
 * Retrieves a user profile by ID from the 'users' collection
 * @param userId The ID of the user to retrieve
 * @returns The user profile data including the document ID, or null if not found
 */
export const getUserById = async (userId: string): Promise<UserProfile | null> => {
  try {
    const userRef = doc(db, "users", userId); // Assuming 'users' is your collection name
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      // Combine document ID with its data
      return { id: userSnap.id, ...userSnap.data() } as UserProfile;
    } else {
      console.log("No user found with ID:", userId);
      return null;
    }
  } catch (error) {
    console.error("Error getting user by ID:", error);
    throw error;
  }
};

/**
 * Retrieves an order by its ID
 * @param orderId The order ID to retrieve
 * @returns The order data or null if not found
 */
export const getOrderById = async (orderId: string): Promise<OrderData | null> => {
  try {
    const orderRef = doc(db, "orders", orderId); // Use 'orders' collection
    const orderSnap = await getDoc(orderRef);
    
    if (orderSnap.exists()) {
      return orderSnap.data() as OrderData;
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error getting order:", error);
    throw error;
  }
};

/**
 * Gets all orders for a specific user
 * @param userId The user ID to get orders for
 * @returns Array of order data
 */
export const getUserOrders = async (userId: string): Promise<OrderData[]> => {
  try {
    const ordersRef = collection(db, "orders"); // Use 'orders' collection
    const q = query(ordersRef, where("userId", "==", userId));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => doc.data() as OrderData);
  } catch (error) {
    console.error("Error getting user orders:", error);
    throw error;
  }
};

/**
 * Gets all orders for a specific restaurant
 * @param restaurantId The restaurant ID to get orders for
 * @returns Array of order data
 */
export const getRestaurantOrders = async (restaurantId: string): Promise<OrderData[]> => {
  try {
    const ordersRef = collection(db, "orders"); // Use 'orders' collection
    const q = query(ordersRef, where("restaurantId", "==", restaurantId));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => doc.data() as OrderData);
  } catch (error) {
    console.error("Error getting restaurant orders:", error);
    throw error;
  }
};

/**
 * Updates payment information for an order
 * @param orderId The order ID to update
 * @param paymentMethod The new payment method
 */
export const updatePaymentMethod = async (orderId: string, paymentMethod: string): Promise<void> => {
  try {
    const orderRef = doc(db, "orders", orderId); // Use 'orders' collection
    await setDoc(orderRef, { paymentMethod }, { merge: true });
  } catch (error) {
    console.error("Error updating payment method:", error);
    throw error;
  }
};

/**
 * Updates the status of a specific order in Firestore.
 * @param orderId The ID of the order to update.
 * @param newStatus The new status to set for the order.
 */
export const updateFirestoreOrderStatus = async (orderId: string, newStatus: OrderStatusType): Promise<void> => {
  try {
    const orderRef = doc(db, "orders", orderId);
    await setDoc(orderRef, { status: newStatus }, { merge: true });
    console.log(`Order ${orderId} status updated to ${newStatus} in Firestore.`);
  } catch (error) {
    console.error(`Error updating Firestore order status for ${orderId}:`, error);
    throw error;
  }
};

/**
 * Retrieves a user profile by email from the 'users' collection
 * @param email The email address to search for
 * @returns The user profile data including the document ID, or null if not found
 */
export const getUserByEmail = async (email: string): Promise<UserProfile | null> => {
  try {
    const usersRef = collection(db, "users"); // Assuming 'users' is your collection name
    const q = query(usersRef, where("email", "==", email));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      console.log("No user found with email:", email);
      return null;
    }

    // Assuming email is unique, there should only be one document
    const userDoc = querySnapshot.docs[0];
    return { id: userDoc.id, ...userDoc.data() } as UserProfile;

  } catch (error) {
    console.error("Error getting user by email:", error);
    // Re-throw or handle as appropriate for your application
    throw error;
  }
};

/**
 * Retrieves all delivery zones from the 'deliveryZones' collection.
 * @returns Array of DeliveryZone data.
 */
export const getDeliveryZones = async (): Promise<DeliveryZone[]> => {
  try {
    const zonesCollectionRef = collection(db, "deliveryZones"); // Assuming 'deliveryZones' is your collection name
    const querySnapshot = await getDocs(zonesCollectionRef);

    if (querySnapshot.empty) {
      console.log("No delivery zones found.");
      return [];
    }

    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      const centerField = data.center;

      // Validate center coordinates, expecting GeoPoint
      if (centerField instanceof GeoPoint &&
          typeof data.name === 'string' && // Also ensure name is a string
          data.radius !== undefined && typeof data.radius === 'number' && isFinite(data.radius)) {
        return {
          id: doc.id,
          name: data.name,
          center: { lat: centerField.latitude, lng: centerField.longitude },
          radius: data.radius,
        } as DeliveryZone;
      } else if (centerField && typeof centerField.lat === 'number' && typeof centerField.lng === 'number' &&
                 isFinite(centerField.lat) && isFinite(centerField.lng) && // Fallback for {lat, lng} object
                 typeof data.name === 'string' &&
                 data.radius !== undefined && typeof data.radius === 'number' && isFinite(data.radius)) {
        console.warn(`Delivery zone ${doc.id} has center as an object {lat, lng} instead of GeoPoint. Processing anyway.`);
        return {
          id: doc.id,
          name: data.name,
          center: { lat: centerField.lat, lng: centerField.lng },
          radius: data.radius,
        } as DeliveryZone;
      }
      else {
        console.warn(`Invalid or missing fields for delivery zone ${doc.id}. Expected name (string), center (GeoPoint), radius (number). Skipping this zone. Data:`, data);
        return null; // This zone will be filtered out
      }
    }).filter(zone => zone !== null) as DeliveryZone[]; // Filter out nulls (invalid zones)
  } catch (error) {
    console.error("Error getting delivery zones:", error);
    throw error;
  }
};
