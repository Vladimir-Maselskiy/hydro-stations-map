import { createTestApiMiddleware } from '../frontend/api-middleware.js';

// Both adapters use the provided API implementation, including its default 503 rate.
export function createVercelHandler(options) {
  const middleware = createTestApiMiddleware(options);
  return (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    if (new URL(request.url, 'http://localhost').pathname === '/api/health') {
      request.url = '/health';
    }
    return middleware(request, response, () => {
      response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } }));
    });
  };
}

export default createVercelHandler();
