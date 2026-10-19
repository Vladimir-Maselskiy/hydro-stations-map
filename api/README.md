# Local test API

The API is served by the frontend development server. It starts with the frontend; no separate backend process, Python installation, or API dependency setup is required.

From the package root, run the same commands on Windows, Linux, or macOS:

```sh
cd frontend
npm ci
npm run dev
```

The frontend is available at <http://127.0.0.1:5173>, Swagger UI at <http://127.0.0.1:5173/docs/>, and the health check at <http://127.0.0.1:5173/health>.

The API provides 10,000 synthetic stations and 36 measurements per station. Station IDs, coordinates, and measurements are stable across requests, so overlapping map areas return the same stations at the same locations. It returns at most 100 records per page. Each `/api/*` request has a 10% default chance of returning HTTP `503`; `/health` and Swagger are not affected.

To change the error rate for a local run, set `TEST_API_ERROR_RATE` to a number from `0` to `1` before starting the development server. In PowerShell:

```powershell
$env:TEST_API_ERROR_RATE = '0'
npm run dev
```

In Linux and macOS shells:

```sh
TEST_API_ERROR_RATE=0 npm run dev
```

The API documentation is defined in [`openapi.json`](openapi.json).
