import { io } from "socket.io-client";

// Change this to your server's IP/domain when deploying
const URL = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:5000";

export const socket = io(URL, {
  autoConnect: true,
});