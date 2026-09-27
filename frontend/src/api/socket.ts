import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

/** Connect (or return the existing) socket. Auth flows through the session cookie. */
export function getSocket(): Socket {
  if (socket && socket.connected) return socket;
  if (socket) socket.disconnect();
  socket = io('/', {
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnectionDelayMax: 10_000,
  });
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
