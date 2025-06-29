# Pulse Flows Dashboard

Frontend dashboard for the Pulse Flows content crawling and management system.

## Overview

This repository contains the web-based dashboard interfaces for managing and monitoring the Pulse Flows API service. The dashboard has been separated from the main API service for better organization and deployment flexibility.

## Dashboard Components

### Main Dashboard
- **admin-dashboard.html** - Central navigation hub with cards for all resources
- Modern glassmorphism design with responsive layout
- Real-time statistics and quick actions

### Specialized Interfaces
- **model-evaluation-dashboard.html** - AI model comparison and evaluation interface
- **crawl-dashboard.html** - Crawl management and monitoring interface
- **admin-table.html** - Content labeling table interface with bulk operations
- **admin-simple.html** - Simple content labeling interface
- **admin-debug.html** - Debug tools and system diagnostics

### Assets
- **js/admin/** - JavaScript modules for admin functionality
- **css/** - Stylesheets (if any)

## Features
- **Model Evaluation**: Compare AI models (OpenAI, Gemini, Gemma) side-by-side for content parsing

- **Real-time Monitoring** - Live status updates and statistics
- **Model Evaluation** - Compare AI models (OpenAI, Gemini, Gemma) side-by-side
- **Content Management** - Label and manage crawled content
- **Area Management** - Geographic area configuration
- **System Operations** - Cleanup, maintenance, and monitoring tools

## API Integration

The dashboard connects to the Pulse Flows API service running on port 8080:
- **API Base URL**: `http://localhost:8080/api/flows`
- **Health Check**: `http://localhost:8080/health`
- **Model Evaluation**: `http://localhost:8080/api/flows/model-evaluation`

## Development

### Prerequisites
- Pulse Flows API service running
- Modern web browser with JavaScript enabled

### Local Development
1. Serve the dashboard files using any static web server
2. Configure API endpoints if running on different host/port
3. Open admin-dashboard.html as the main entry point

### Deployment
- Can be deployed to any static hosting service (Netlify, Vercel, GitHub Pages)
- Ensure CORS is configured on the API service for dashboard domain
- Update API endpoints in dashboard files for production

## Architecture

```
Dashboard Repositories:
├── pulse-flows-dashboard/     # Frontend (this repo)
│   ├── admin-dashboard.html   # Main navigation
│   ├── crawl-dashboard.html   # Crawl management
│   ├── admin-*.html          # Admin interfaces
│   └── js/admin/             # JavaScript modules
└── pulse-flows/              # Backend API service
    ├── src/                  # API source code
    └── dist/                 # Compiled API
```

## Recent Updates

- **Dashboard Separation**: Moved from pulse-flows to dedicated repository
- **Enhanced Model Evaluation**: Added Gemma models support (gemma-3-12b-it, gemma-3-27b-it)
- **Improved Navigation**: Main dashboard serves as central hub
- **Modern UI**: Glassmorphism design with responsive layout

Built with ❤️ using Claude Code

## Quick Start

### Local Development
```bash
# Install dependencies
npm install

# Start the dashboard server
npm start
```

Visit: http://localhost:3000

### Static Deployment
The dashboard can be deployed to any static hosting service:
- **Netlify**: Connect repository, build: `npm run build`, publish: `.`
- **Vercel**: Connect repository, framework: Other, output: `.`
- **GitHub Pages**: Enable in settings, source: main branch

### Node.js Deployment
For dynamic hosting with Express server:
- **Heroku**: Connect repository, buildpack: Node.js
- **Railway/Render**: Connect repository, start: `npm start`

See `DEPLOYMENT.md` for detailed instructions.

## Architecture

```
pulse-flows-dashboard/         # Frontend Dashboard (this repo)
├── index.html                 # Main entry point
├── admin-dashboard.html       # Navigation hub
├── crawl-dashboard.html       # Crawl management
├── admin-*.html              # Admin interfaces
├── js/admin/                 # JavaScript modules
├── server.js                 # Express server
└── package.json              # Dependencies

pulse-flows/                   # Backend API (separate repo)
├── src/                      # API source code
└── dist/                     # Compiled API
```
