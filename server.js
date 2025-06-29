const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.datatables.net", "https://code.jquery.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.datatables.net", "https://code.jquery.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "http:"],
      connectSrc: ["'self'", "http://localhost:8080", "https://flows.vibesquare.app"],
      fontSrc: ["'self'", "https:", "data:"],
    },
  },
}));

// CORS for API communication
app.use(cors({
  origin: ['http://localhost:8080', 'https://flows.vibesquare.app'],
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));

// Serve static files
app.use(express.static('views'));
app.use('/static', express.static('static'));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'crawl-dashboard.html'));
});

app.get('/admin-simple', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin-simple.html'));
});

app.get('/admin-table', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin-table.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'pulse-flows-dashboard',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'views', 'crawl-dashboard.html'));
});

app.listen(PORT, () => {
  console.log(`🎛️  Pulse Flows Dashboard running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 Main Dashboard: http://localhost:${PORT}/`);
  console.log(`📝 Admin Simple: http://localhost:${PORT}/admin-simple`);
  console.log(`📊 Admin Table: http://localhost:${PORT}/admin-table`);
});