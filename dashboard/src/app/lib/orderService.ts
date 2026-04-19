import {
  // Types and other functions from firestoreService that are still needed
  OrderData, 
  OrderItem,
  DeliveryInfo,
  DeliveryDateTime,
  OrderStatusType,
  updateFirestoreOrderStatus, // Used by completeOrder
  getOrderById as getFirestoreOrder, // Used by getCompleteOrderData
  getRestaurantOrders as getFirestoreRestaurantOrders // Used by getRestaurantOrders
} from './firestoreService'; 
// DO NOT import firestoreAdminService here

import {
  // initializeRealTimeOrder, // This is now handled by firestoreAdminService
  updateOrderStatus,
  addNotification,
  updateDeliveryTracking,
  addLocationUpdate,
  addCustomerFeedback,
  subscribeToOrderUpdates,
  subscribeToOrderStatus,
  subscribeToDeliveryTracking,
  subscribeToNotifications,
  OrderStatus, 
  OrderStatusData,
  LocationUpdate,
  RealTimeOrderData,
  DeliveryTrackingData,
  NotificationData
} from './realtimeDbService';

// The createOrder function that used Admin SDK has been removed from this file.
// It will be handled directly by the API route calling firestoreAdminService.

// Other functions remain the same as they use client SDK or RTDB SDK as appropriate

export const updateOrderStatusWithNotification = async (
  orderId: string,
  status: OrderStatus, 
  progress: number,
  estimatedTime: number
): Promise<void> => {
  try {
    const statusData: OrderStatusData = { orderStatus: status, progress, estimatedTime };
    await updateOrderStatus(orderId, statusData);
    let message = "";
    switch (status) {
      case "confirmed": message = "¡Tu pedido ha sido confirmado!"; break;
      case "preparing": message = "El chef está preparando tu pedido con cuidado"; break;
      case "on-the-way": message = `Tu pedido está en camino. Tiempo estimado: ${estimatedTime} minutos`; break;
      case "completed": message = "¡Tu pedido ha sido entregado! ¡Buen provecho!"; break;
    }
    if (message) await addNotification(orderId, message);
  } catch (error) {
    console.error("Error updating order status with notification:", error);
    throw error;
  }
};

export const assignDeliveryPerson = async (
  orderId: string,
  deliveryPersonId: string,
  initialLocation: LocationUpdate
): Promise<void> => {
  try {
    await updateDeliveryTracking(orderId, { deliveryPersonId });
    await addLocationUpdate(orderId, initialLocation);
    await addNotification(orderId, "Un repartidor ha sido asignado a tu pedido");
  } catch (error) {
    console.error("Error assigning delivery person:", error);
    throw error;
  }
};

export const updateDeliveryLocation = async (
  orderId: string,
  location: LocationUpdate
): Promise<void> => {
  try {
    await addLocationUpdate(orderId, location);
  } catch (error) {
    console.error("Error updating delivery location:", error);
    throw error;
  }
};

export const completeOrder = async (orderId: string): Promise<void> => {
  try {
    // Assuming updateOrderStatusWithNotification also handles RTDB update for "completed"
    await updateOrderStatusWithNotification(orderId, "completed", 100, 0); 
    // Then update Firestore status
    await updateFirestoreOrderStatus(orderId, "completed"); // Uses client SDK via firestoreService
  } catch (error) {
    console.error("Error completing order:", error);
    throw error;
  }
};

export const submitOrderFeedback = async (
  orderId: string,
  feedback: string,
  rating: number
): Promise<void> => {
  try {
    await addCustomerFeedback(orderId, feedback, rating);
    await addNotification(orderId, "¡Gracias por tus comentarios!");
  } catch (error) {
    console.error("Error submitting feedback:", error);
    throw error;
  }
};

export const getCompleteOrderData = async (
  orderId: string
): Promise<{
  firestoreData: OrderData | null;
  realtimeData: RealTimeOrderData | null;
}> => {
  try {
    const [firestoreData, realtimeData] = await Promise.all([
      getFirestoreOrder(orderId), 
      new Promise<RealTimeOrderData | null>((resolve) => {
        let unsubscribed = false;
        const unsubscribe = subscribeToOrderUpdates(
          orderId,
          (data) => { if (!unsubscribed) { unsubscribe(); unsubscribed = true; resolve(data); } },
          (error?: Error) => {
            if (!unsubscribed) {
              unsubscribe(); unsubscribed = true;
              console.warn(`orderService: Error/NoData RTDB for order ${orderId}: ${error?.message || 'Not found'}.`);
              resolve(null);
            }
          }
        );
        setTimeout(() => { if (!unsubscribed) { unsubscribe(); unsubscribed = true; console.warn(`orderService: Timeout RTDB for order ${orderId}.`); resolve(null); } }, 5000);
      })
    ]);
    return { firestoreData, realtimeData };
  } catch (error) {
    console.error("Error getting complete order data:", error);
    throw error;
  }
};

export const getRestaurantOrders = async (restaurantId: string): Promise<OrderData[]> => {
  return getFirestoreRestaurantOrders(restaurantId); 
};

export {
  subscribeToOrderUpdates,
  subscribeToOrderStatus,
  subscribeToDeliveryTracking,
  subscribeToNotifications
};

export type {
  OrderData,
  OrderItem,
  DeliveryInfo,
  DeliveryDateTime,
  OrderStatusType,
  OrderStatus,
  OrderStatusData,
  LocationUpdate,
  RealTimeOrderData,
  DeliveryTrackingData,
  NotificationData
};
