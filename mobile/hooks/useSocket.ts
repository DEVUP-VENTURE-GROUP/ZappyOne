import { useEffect } from 'react';
import { socketClient } from '../services/socket/socketClient';

/** Connects the socket and, if given an order id, subscribes to its room for the component's lifetime. */
export const useSocket = (orderId?: string) => {
  useEffect(() => {
    socketClient.connect();

    if (orderId) {
      socketClient.subscribeOrder(orderId);
    }

    return () => {
      if (orderId) {
        socketClient.unsubscribeOrder(orderId);
      }
    };
  }, [orderId]);

  return socketClient;
};
