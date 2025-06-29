# Pulse Flows Dashboard Deployment

## Quick Start

### Local Development
```bash
# Install dependencies
npm install

# Start the dashboard server
npm start
```

The dashboard will be available at `http://localhost:3000`

### Static Hosting Deployment

#### Netlify
1. Connect your repository to Netlify
2. Set build command: `npm run build`
3. Set publish directory: `.` (root)
4. Deploy

#### Vercel
1. Connect your repository to Vercel
2. Framework preset: Other
3. Build command: `npm run build`
4. Output directory: `.` (root)
5. Deploy

#### GitHub Pages
1. Enable GitHub Pages in repository settings
2. Set source to main branch
3. The `index.html` will automatically redirect to the main dashboard

### Node.js Hosting Deployment

#### Heroku
1. Create a Heroku app
2. Set buildpack to Node.js
3. Deploy from GitHub or using Heroku CLI
4. The `server.js` will serve the dashboard

#### Railway/Render
1. Connect your repository
2. Set start command: `npm start`
3. Deploy

## Configuration

### API Endpoint Configuration
Update the API endpoints in dashboard files if deploying to a different domain:

1. Edit JavaScript files in `js/admin/` directory
2. Update API base URLs to point to your pulse-flows API service
3. Ensure CORS is configured on the API service

### Environment Variables
- `PORT`: Server port (default: 3000)

## Dashboard Structure

- **index.html**: Main entry point (redirects to admin dashboard)
- **admin-dashboard.html**: Main navigation hub
- **crawl-dashboard.html**: Crawl management interface
- **admin-*.html**: Specialized admin interfaces
- **js/admin/**: JavaScript modules
- **server.js**: Express server for Node.js hosting

## API Integration

The dashboard connects to the Pulse Flows API service:
- Default: `http://localhost:8080/api/flows`
- Update endpoints in JS files for production deployment
