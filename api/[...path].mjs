import app from "../artifacts/api-server/src/app.ts";

const runExpress = app;

export default function handler(request, response) {
  if (request.url && !request.url.startsWith("/api")) {
    request.url = `/api${request.url.startsWith("/") ? "" : "/"}${request.url}`;
  }
  runExpress(request, response);
}
