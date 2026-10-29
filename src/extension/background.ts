import { onMessage } from "./api.ts";

onMessage((message) => (message === "ping" ? "pong" : undefined));
