import { createReadStream, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STATION_COUNT = 10_000;
const MEASUREMENTS_PER_STATION = 36;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const DEFAULT_ERROR_RATE = 0.1;
const MEASUREMENT_EPOCH = Date.UTC(2026, 0, 1, 12);
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const RIVER_NAMES = ['Дніпро', 'Південний Буг', 'Дністер', 'Сіверський Донець', 'Десна'];
const API_SPEC = JSON.parse(
  readFileSync(new URL('../api/openapi.json', import.meta.url), 'utf8'),
);
const require = createRequire(import.meta.url);
const SWAGGER_UI_PATH = require('swagger-ui-dist').getAbsoluteFSPath();
const SWAGGER_UI_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Station Map Test API</title>
    <link rel="stylesheet" href="/swagger-ui/swagger-ui.css">
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="/swagger-ui/swagger-ui-bundle.js"></script>
    <script>
      SwaggerUIBundle({ url: '/openapi.json', dom_id: '#swagger-ui' });
    </script>
  </body>
</html>`;

const stations = Array.from({ length: STATION_COUNT }, (_, offset) => createStation(offset + 1));

function fraction(seed, salt) {
  const value = Math.sin(seed * 12.9898 + salt * 78.233) * 43_758.5453;
  return value - Math.floor(value);
}

function stationId(index) {
  return `st-${String(index).padStart(5, '0')}`;
}

function readingValue(index, sequence) {
  const baseline = 0.8 + fraction(index, 4) * 5.2;
  const variation = Math.sin((sequence + (index % 17)) / 4) * 0.35;
  return Math.round((Math.max(0.1, baseline + variation) + Number.EPSILON) * 100) / 100;
}

function readingTime(index, sequence) {
  const timestamp = new Date(MEASUREMENT_EPOCH - sequence * DAY - (index % 12) * HOUR);
  return timestamp.toISOString();
}

function createStation(index) {
  return {
    id: stationId(index),
    name: `Пост ${String(index).padStart(5, '0')}`,
    river: RIVER_NAMES[(index - 1) % RIVER_NAMES.length],
    coordinates: {
      latitude: Number((46 + fraction(index, 1) * 5).toFixed(5)),
      longitude: Number((27 + fraction(index, 2) * 8).toFixed(5)),
    },
    latestMeasurement: {
      value: readingValue(index, 0),
      unit: 'м',
      measuredAt: readingTime(index, 0),
    },
  };
}

function isKnownStation(identifier) {
  const match = /^st-(\d{5})$/.exec(identifier);
  if (!match) return false;
  const index = Number(match[1]);
  return index >= 1 && index <= STATION_COUNT && stationId(index) === identifier;
}

function parsePageValue(raw, maximum) {
  if (!/^\d+$/.test(raw)) return undefined;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < (maximum ? 1 : 0)) return undefined;
  if (maximum && value > maximum) return undefined;
  return value;
}

function parseBbox(raw) {
  if (!raw) return undefined;
  const parts = raw.split(',');
  if (parts.length !== 4 || parts.some((part) => part.trim() === '')) return null;
  const values = parts.map(Number);
  if (values.length !== 4 || !values.every(Number.isFinite)) return null;

  const [west, south, east, north] = values;
  if (
    west < -180 || east > 180 || south < -90 || north > 90 ||
    west >= east || south >= north
  ) {
    return null;
  }
  return { west, south, east, north };
}

function errorResponse(response, status, code, message) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({ error: { code, message } }));
}

function sendJson(response, body, status = 200) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function page(items, limit, cursor) {
  const data = items.slice(cursor, cursor + limit);
  const nextCursor = cursor + data.length;
  const hasMore = nextCursor < items.length;
  return {
    data,
    pagination: {
      limit,
      totalItems: items.length,
      nextCursor: hasMore ? String(nextCursor) : null,
      hasMore,
    },
  };
}

function stationMeasurements(identifier, stationIndex, limit, cursor) {
  const measurements = Array.from({ length: MEASUREMENTS_PER_STATION }, (_, sequence) => ({
    id: `${identifier}-m-${String(sequence + 1).padStart(3, '0')}`,
    value: readingValue(stationIndex, sequence),
    unit: 'м',
    measuredAt: readingTime(stationIndex, sequence),
  }));
  return page(measurements, limit, cursor);
}

function contentType(filePath) {
  switch (path.extname(filePath)) {
    case '.css': return 'text/css; charset=utf-8';
    case '.js': return 'text/javascript; charset=utf-8';
    case '.png': return 'image/png';
    case '.svg': return 'image/svg+xml';
    default: return 'application/octet-stream';
  }
}

function serveSwaggerAsset(response, pathname) {
  const relativePath = pathname.slice('/swagger-ui/'.length);
  const assetPath = path.resolve(SWAGGER_UI_PATH, relativePath);
  if (!assetPath.startsWith(`${SWAGGER_UI_PATH}${path.sep}`)) {
    response.writeHead(404).end();
    return;
  }

  try {
    const stat = statSync(assetPath);
    if (!stat.isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': contentType(assetPath) });
    createReadStream(assetPath).pipe(response);
  } catch {
    response.writeHead(404).end();
  }
}

export function createTestApiMiddleware({ errorRate = DEFAULT_ERROR_RATE, random = Math.random } = {}) {
  if (!Number.isFinite(errorRate) || errorRate < 0 || errorRate > 1) {
    throw new RangeError('TEST_API_ERROR_RATE must be a number between 0 and 1.');
  }

  return (request, response, next = () => {}) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const { pathname, searchParams } = url;

    if (pathname === '/docs' || pathname === '/docs/') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(SWAGGER_UI_HTML);
      return;
    }
    if (pathname === '/openapi.json') {
      sendJson(response, API_SPEC);
      return;
    }
    if (pathname.startsWith('/swagger-ui/')) {
      serveSwaggerAsset(response, pathname);
      return;
    }
    if (pathname === '/health' && request.method === 'GET') {
      sendJson(response, { status: 'ok' });
      return;
    }

    const isStationsRequest = pathname === '/api/stations';
    const measurementsMatch = /^\/api\/stations\/([^/]+)\/measurements$/.exec(pathname);
    if (request.method !== 'GET' || (!isStationsRequest && !measurementsMatch)) {
      if (pathname === '/api' || pathname.startsWith('/api/')) {
        response.writeHead(404).end();
      } else {
        next();
      }
      return;
    }

    const sample = random();
    if (sample < errorRate) {
      errorResponse(response, 503, 'SERVICE_UNAVAILABLE', 'Сервіс тимчасово недоступний.');
      return;
    }

    const limit = parsePageValue(searchParams.get('limit') ?? String(DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
    const cursor = parsePageValue(searchParams.get('cursor') ?? '0');
    if (limit === undefined) {
      errorResponse(response, 400, 'INVALID_LIMIT', 'Розмір сторінки має бути від 1 до 100.');
      return;
    }
    if (cursor === undefined) {
      errorResponse(response, 400, 'INVALID_CURSOR', 'Курсор має бути невід’ємним цілим числом.');
      return;
    }

    if (isStationsRequest) {
      const bbox = parseBbox(searchParams.get('bbox') ?? '');
      if (bbox === null) {
        errorResponse(
          response,
          400,
          'INVALID_BBOX',
          'Область карти має містити коректні західну, південну, східну та північну координати.',
        );
        return;
      }
      const search = (searchParams.get('search') ?? '').trim().toLocaleLowerCase();
      const result = stations.filter((station) => {
        if (search && !`${station.name} ${station.river}`.toLocaleLowerCase().includes(search)) {
          return false;
        }
        if (bbox) {
          const { latitude, longitude } = station.coordinates;
          if (!(bbox.west <= longitude && longitude <= bbox.east && bbox.south <= latitude && latitude <= bbox.north)) {
            return false;
          }
        }
        return true;
      });
      sendJson(response, page(result, limit, cursor));
      return;
    }

    const stationIdentifier = decodeURIComponent(measurementsMatch[1]);
    if (!isKnownStation(stationIdentifier)) {
      errorResponse(response, 404, 'STATION_NOT_FOUND', 'Станцію не знайдено.');
      return;
    }
    const stationIndex = Number(stationIdentifier.slice(3));
    sendJson(response, stationMeasurements(stationIdentifier, stationIndex, limit, cursor));
  };
}

export function testApiPlugin() {
  const configuredRate = Number(process.env.TEST_API_ERROR_RATE ?? DEFAULT_ERROR_RATE);
  return {
    name: 'uhmi-candidate-test-api',
    configureServer(server) {
      server.middlewares.use(createTestApiMiddleware({ errorRate: configuredRate }));
    },
  };
}
