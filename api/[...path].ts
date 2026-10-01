import type { IncomingMessage, ServerResponse } from "node:http";
import app from "../artifacts/api-server/src/app";

const runExpress = app as unknown as (
  request: IncomingMessage,
  response: ServerResponse,
) => void;

export default function handler(
  request: IncomingMessage,
  response: ServerResponse,
): void {
  if (request.url && !request.url.startsWith("/api")) {
    request.url = `/api${request.url.startsWith("/") ? "" : "/"}${request.url}`;
  }
  runExpress(request, response);
}