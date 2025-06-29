const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static('.'));

// Default route - serve admin dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-dashboard.html'));
});

// Fallback for SPA routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-dashboard.html'));
});

app.listen(PORT, () => {
    console.log(`🎛️ Pulse Flows Dashboard running on port ${PORT}`);
    console.log(`📊 Main Dashboard: http://localhost:${PORT}/`);
    console.log(`🚀 Crawl Dashboard: http://localhost:${PORT}/crawl-dashboard.html`);
    console.log(`🏷️ Admin Interfaces: http://localhost:${PORT}/admin-*.html`);
});
