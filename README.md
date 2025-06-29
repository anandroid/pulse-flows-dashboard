# Dashboard Module

This folder contains all dashboard-related code for the Pulse Flows application, separated from the core business logic.

## Structure

```
src/dashboard/
├── routes/
│   ├── dashboard-routes.ts    # Main dashboard router combining all routes
│   ├── monitoring-routes.ts   # Crawl monitoring and logging APIs
│   └── admin-routes.ts        # Admin interface APIs
├── views/
│   ├── crawl-dashboard.html   # Main crawl monitoring dashboard
│   ├── admin-dashboard.html   # Admin overview dashboard
│   ├── admin-simple.html      # Simple admin interface
│   ├── admin-table.html       # Table-based admin interface
│   ├── admin-debug.html       # Debug tools interface
│   ├── content-labeling.html  # Content labeling interface
│   ├── content-labeling-table.html # Table-based content labeling
│   └── clusters.html          # Cluster management interface
├── static/
│   └── js/
│       └── admin/             # JavaScript files for admin interfaces
├── services/                  # Dashboard-specific services (for future use)
└── README.md                  # This file
```

## Key Features

### Monitoring Dashboard (`/crawl-dashboard.html`)
- Real-time crawl status monitoring
- Live log streaming with 📡 Live Server Log button
- Area-based filtering
- Quick actions for scheduling crawls
- Upcoming jobs display

### Admin Interfaces
- **Content Labeling**: Manual content classification and training
- **Debug Tools**: System diagnostics and troubleshooting
- **Cluster Management**: Content clustering and organization

## API Endpoints

### Monitoring APIs (`/api/flows/monitor/*`)
- `GET /status` - Get current crawl status
- `GET /logs` - List available log files
- `GET /logs/:filename` - Get specific log content
- `GET /logs/live/server` - Live server log streaming
- `POST /track/start` - Start crawl tracking
- `POST /track/progress` - Update crawl progress
- `POST /track/end` - End crawl tracking

### Admin APIs (`/api/flows/admin/*`)
- Content management and labeling
- Agent evaluation and training
- LLM chat interface
- Corrections and pattern recognition

## Routing

The dashboard is mounted on the main Express app with:
- `/api/flows/*` - API endpoints
- `/*` - HTML files and static assets

## Live Log Streaming

The dashboard includes real-time log monitoring:
1. Server logs are available via `/api/flows/monitor/logs/live/server`
2. Auto-refresh every 2 seconds when viewing live logs
3. Last 200 lines displayed by default
4. Timestamp tracking and live indicators

## Static Assets

JavaScript files are served from `/js/*` and map to the `static/js/` directory within the dashboard module.

## Integration

The dashboard module is cleanly separated from core business logic:
- **Clustering logic**: Remains in `src/services/` and `src/routes/`
- **Dashboard code**: Isolated in `src/dashboard/`
- **Core APIs**: Maintained in `src/routes/`

This separation allows for:
- Independent development and testing
- Easier maintenance and updates
- Cleaner code organization
- Potential future extraction as a separate package