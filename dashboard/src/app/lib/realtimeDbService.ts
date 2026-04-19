// Only import client SDK for all functions in this file
import { rtdb as clientRtdb } from "@/config/firebase"; 
// DO NOT import admin from '@/config/firebase-admin' here;
import { 
  ref as clientRef, 
  set as clientSet, 
  onValue as clientOnValue, 
  update as clientUpdate, 
  push as clientPush, 
  get as clientGet, 
  DataSnapshot,
  DatabaseReference
} from "firebase/database"; 

// Types (remain the same)
export type OrderStatus = "confirmed" | "preparing" | "on-the-way" | "completed" | "cancelled";

export interface OrderStatusData {
  orderStatus: OrderStatus;
  progress: number;
  estimatedTime: number;
}

export interface LocationUpdate {
  latitude: number;
  longitude: number;
  timestamp: number;
}

export interface DeliveryTrackingData {
  deliveryPersonId: string | null;
  locationUpdates: LocationUpdate[];
}

export interface NotificationData {
  message: string;
  timestamp: number;
  read: boolean;
}

export interface CustomerInteractionData {
  customerFeedback: string | null;
  rating: number | null;
}

export interface RealTimeOrderData {
  status: OrderStatusData;
  tracking: DeliveryTrackingData;
  notifications: Record<string, NotificationData>;
  customerInteraction: CustomerInteractionData;
}

// initializeRealTimeOrder has been MOVED to firestoreAdminService.ts
// as it needs to run with Admin SDK privileges.

/**
 * Updates the status of an order
 * @param orderId The order ID to update
 * @param statusData The new status data
 */
export const updateOrderStatus = async (
  orderId: string, 
  statusData: OrderStatusData
): Promise<void> => {
  try {
    const statusRef = clientRef(clientRtdb, `triada-culinaria-orders/${orderId}/status`);
    await clientUpdate(statusRef, statusData);
    await addNotification(orderId, `Estatus del Pedido: ${statusData.orderStatus}`);
  } catch (error) {
    console.error("Error updating order status:", error);
    throw error;
  }
};

/**
 * Updates the delivery tracking information
 * @param orderId The order ID to update
 * @param trackingData The tracking data to update
 */
export const updateDeliveryTracking = async (
  orderId: string,
  trackingData: Partial<DeliveryTrackingData>
): Promise<void> => {
  try {
    const trackingRef = clientRef(clientRtdb, `triada-culinaria-orders/${orderId}/tracking`);
    await clientUpdate(trackingRef, trackingData);
  } catch (error) {
    console.error("Error updating delivery tracking:", error);
    throw error;
  }
};

/**
 * Adds a location update for a delivery
 * @param orderId The order ID
 * @param location The location update
 */
export const addLocationUpdate = async (
  orderId: string,
  location: LocationUpdate
): Promise<void> => {
  try {
    const locationsRef = clientRef(clientRtdb, `triada-culinaria-orders/${orderId}/tracking/locationUpdates`);
    const newLocationRef = clientPush(locationsRef);
    await clientSet(newLocationRef, location);
  } catch (error) {
    console.error("Error adding location update:", error);
    throw error;
  }
};

/**
 * Adds a notification for an order
 * @param orderId The order ID
 * @param message The notification message
 */
export const addNotification = async (
  orderId: string,
  message: string
): Promise<void> => {
  try {
    const notificationsRef = clientRef(clientRtdb, `triada-culinaria-orders/${orderId}/notifications`);
    const newNotificationRef = clientPush(notificationsRef);
    const notification: NotificationData = {
      message,
      timestamp: Date.now(),
      read: false
    };
    await clientSet(newNotificationRef, notification);
  } catch (error) {
    console.error("Error adding notification:", error);
    throw error;
  }
};

/**
 * Marks a notification as read
 * @param orderId The order ID
 * @param notificationId The notification ID
 */
export const markNotificationAsRead = async (
  orderId: string,
  notificationId: string
): Promise<void> => {
  try {
    const notificationRef = clientRef(clientRtdb, `triada-culinaria-orders/${orderId}/notifications/${notificationId}`);
    await clientUpdate(notificationRef, { read: true });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    throw error;
  }
};

/**
 * Adds customer feedback for an order
 * @param orderId The order ID
 * @param feedback The feedback text
 * @param rating The rating (1-5)
 */
export const addCustomerFeedback = async (
  orderId: string,
  feedback: string,
  rating: number
): Promise<void> => {
  try {
    const interactionRef = clientRef(clientRtdb, `triada-culinaria-orders/${orderId}/customerInteraction`);
    await clientUpdate(interactionRef, {
      customerFeedback: feedback,
      rating
    });
  } catch (error) {
    console.error("Error adding customer feedback:", error);
    throw error;
  }
};

/**
 * Gets the current real-time data for an order
 * @param orderId The order ID
 * @returns The real-time order data
 */
export const getRealTimeOrderData = async (orderId: string): Promise<RealTimeOrderData | null> => {
  try {
    const orderRef = clientRef(clientRtdb, `triada-culinaria-orders/${orderId}`);
    const snapshot = await clientGet(orderRef);
    if (snapshot.exists()) {
      return snapshot.val() as RealTimeOrderData;
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error getting real-time order data:", error);
    throw error;
  }
};

export const subscribeToOrderUpdates = (
  orderId: string,
  onData: (data: RealTimeOrderData) => void,
  onNotFoundOrError: (error?: Error) => void
): () => void => {
  if (!orderId || typeof orderId !== 'string' || orderId.trim() === "") {
    console.error("RTDB: subscribeToOrderUpdates called with invalid orderId:", orderId);
    onNotFoundOrError(new Error("Invalid Order ID for RTDB subscription"));
    return () => {};
  }
  try {
    const orderRef = clientRef(clientRtdb, `triada-culinaria-orders/${orderId}`);
    const unsubscribeFromOnValue = clientOnValue(
      orderRef,
      (snapshot: DataSnapshot) => {
        if (snapshot.exists()) {
          onData(snapshot.val() as RealTimeOrderData);
        } else {
          onNotFoundOrError();
        }
      },
      (error) => {
        console.error(`RTDB: Firebase onValue subscription error for order ${orderId}:`, error);
        onNotFoundOrError(error);
      }
    );
    return unsubscribeFromOnValue;
  } catch (error: any) {
    console.error(`RTDB: Critical error setting up subscription for order ${orderId}:`, error);
    onNotFoundOrError(error);
    return () => {};
  }
};

export const subscribeToOrderStatus = (
  orderId: string,
  callback: (statusData: OrderStatusData) => void
): () => void => {
  const statusRef = clientRef(clientRtdb, `triada-culinaria-orders/${orderId}/status`);
  const unsubscribe = clientOnValue(statusRef, (snapshot: DataSnapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.val() as OrderStatusData);
    }
  });
  return unsubscribe;
};

export const subscribeToDeliveryTracking = (
  orderId: string,
  callback: (trackingData: DeliveryTrackingData) => void
): () => void => {
  const trackingRef = clientRef(clientRtdb, `triada-culinaria-orders/${orderId}/tracking`);
  const unsubscribe = clientOnValue(trackingRef, (snapshot: DataSnapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.val() as DeliveryTrackingData);
    }
  });
  return unsubscribe;
};

export const subscribeToNotifications = (
  orderId: string,
  callback: (notifications: Record<string, NotificationData>) => void
): () => void => {
  const notificationsRef = clientRef(clientRtdb, `triada-culinaria-orders/${orderId}/notifications`);
  const unsubscribe = clientOnValue(notificationsRef, (snapshot: DataSnapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.val() as Record<string, NotificationData>);
    } else {
      callback({});
    }
  });
  return unsubscribe;
};

/**
 * Removes an order from the restaurant's active order list in RTDB.
 * This is typically done when an order is cancelled or completed.
 * @param orderId The order ID to remove.
 * @param restaurantId The ID of the restaurant (e.g., "triada-1").
 */
export const removeOrderFromActiveList = async (
  orderId: string,
  restaurantId: string = "triada-1" // Defaulting for now, should be dynamic in a multi-tenant app
): Promise<void> => {
  try {
    const orderRef = clientRef(clientRtdb, `restaurants/${restaurantId}/active-triada-culinaria-orders/${orderId}`);
    await clientSet(orderRef, null);
    console.log(`Order ${orderId} removed from active list for restaurant ${restaurantId}.`);
  } catch (error) {
    console.error("Error removing order from active list:", error);
    throw error;
  }
};

/**
 * Clears all real-time data for a specific order.
 * This is done when an order is cancelled.
 * @param orderId The order ID to clear.
 */
export const clearOrderData = async (orderId: string): Promise<void> => {
  try {
    const orderRef = clientRef(clientRtdb, `triada-culinaria-orders/${orderId}`);
    await clientSet(orderRef, null);
    console.log(`Cleared all RTDB data for order ${orderId}.`);
  } catch (error) {
    console.error(`Error clearing RTDB data for order ${orderId}:`, error);
    throw error;
  }
};
