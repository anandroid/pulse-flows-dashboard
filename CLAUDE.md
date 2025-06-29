# Pulse Flows Dashboard - Web Interface

## Project Overview

**Pulse Flows Dashboard** is the web interface for the Pulse Flows content management system. It provides real-time monitoring, crawl management, and administrative controls for the pulse-flows API service.

### Core Responsibilities
- **Real-time Monitoring**: Live dashboard showing crawl status, logs, and system health
- **Crawl Management**: Execute, schedule, and monitor content crawling operations
- **Log Viewing**: Live server log streaming and historical log access
- **Admin Interface**: Content labeling, quality evaluation, and system administration
- **API Integration**: Seamless communication with pulse-flows service

## Architecture

### Technology Stack
- **Frontend**: HTML5, CSS3, vanilla JavaScript
- **Backend**: Express.js (lightweight server for static file serving)
- **Styling**: Custom CSS with glassmorphism design
- **API Communication**: Fetch API with CORS support

### File Structure
```
pulse-flows-dashboard/
├── views/                      # HTML pages
│   ├── crawl-dashboard.html   # Main monitoring dashboard
│   ├── admin-simple.html      # Simple admin interface
│   └── admin-table.html       # Table-based admin interface
├── static/                     # Static assets (CSS, JS, images)
├── server.js                   # Express server
├── package.json               # Dependencies and scripts
└── CLAUDE.md                  # This file
```

## API Integration

### Pulse Flows Service Communication
- **API Base URL**: `http://localhost:8080` (development) or configured production URL
- **All endpoints**: `/api/flows/*`
- **CORS enabled**: For cross-origin requests between dashboard and API

### Key API Endpoints Used
- **Monitoring**: `/api/flows/monitor/*` - System status and logs
- **Crawling**: `/api/flows/crawl/*` - Execute and manage crawls
- **Areas**: `/api/flows/areas` - Area management
- **Admin**: `/api/flows/admin/*` - Content administration
- **Scheduling**: `/api/flows/schedule/*` - Job scheduling

## Development

### Setup
```bash
npm install
npm run dev  # Start development server on port 3000
```

### Build & Deploy
```bash
npm run build  # Copy assets to dist/
npm run serve  # Serve built files with http-server
```

### Environment Configuration
- **Development**: Points to `http://localhost:8080` (pulse-flows local)
- **Production**: Configure API_BASE_URL for your deployment

## Key Features

### 🚀 Main Dashboard (`crawl-dashboard.html`)
- **Running Crawls**: Real-time progress tracking
- **Quick Actions**: Execute crawls, schedule jobs, view schedules
- **Recent Logs**: Live log streaming with area filtering
- **Job Management**: Schedule and monitor automated crawls

### 📊 Admin Interfaces
- **Simple Admin** (`admin-simple.html`): Basic content management
- **Table Admin** (`admin-table.html`): Advanced table-based interface with LLM chat

### 🔄 Real-time Features
- **Auto-refresh**: Dashboard updates every 5 seconds
- **Live Logs**: Server log streaming with auto-scroll
- **Status Indicators**: Visual indicators for system health
- **Progress Tracking**: Real-time crawl progress monitoring

## API Client Pattern

### Configuration
```javascript
// API base URL configuration
const API_BASE_URL = process.env.NODE_ENV === 'development' 
  ? 'http://localhost:8080'
  : 'https://flows.vibesquare.app';

// API call pattern
async function apiCall(endpoint, options = {}) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  return response.json();
}
```

### Error Handling
- **Network errors**: Graceful fallback with user notifications
- **API errors**: Display error messages from pulse-flows service
- **Loading states**: Show loading indicators during API calls

## Security

### Content Security Policy
- Configured for dashboard assets and API communication
- Allows necessary inline scripts for dashboard functionality
- Restricts external resources to essential CDNs

### CORS Configuration
- Properly configured for pulse-flows API communication
- Supports development and production environments

## Deployment Options

### Option 1: Static Hosting (Recommended)
- Build dashboard and deploy to Vercel/Netlify/GitHub Pages
- Configure API_BASE_URL for production pulse-flows service
- Fastest and most cost-effective

### Option 2: Node.js Server
- Deploy server.js to any Node.js hosting (Railway, Render, etc.)
- Handles routing and static file serving
- More control over server configuration

### Option 3: Container Deployment
- Dockerize the dashboard for container deployment
- Can be deployed alongside pulse-flows or independently

## Development Standards

### Code Organization
- **Separation of concerns**: Each dashboard page has focused functionality
- **Reusable patterns**: Common API client patterns and UI components
- **Consistent styling**: Unified design system across all pages

### Performance
- **Efficient API calls**: Batched requests where possible
- **Optimized refreshing**: Smart refresh intervals to avoid overwhelming API
- **Lazy loading**: Load data only when needed

### Accessibility
- **Keyboard navigation**: All interactive elements accessible via keyboard
- **Screen reader support**: Proper ARIA labels and semantic HTML
- **Visual indicators**: Clear status and progress indicators

## Monitoring & Debugging

### Built-in Tools
- **Health check**: `/health` endpoint for service monitoring
- **Console logging**: Detailed client-side logging for debugging
- **Error boundaries**: Graceful error handling with user feedback

### Integration with Pulse Flows
- **Live server logs**: Direct access to pulse-flows server.log
- **Real-time status**: System health and crawl progress monitoring
- **API diagnostics**: Clear error messages from pulse-flows service

---

This dashboard provides a complete web interface for managing the Pulse Flows content system while maintaining clean separation from the core API service.