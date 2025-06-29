import { Request, Response, Router } from 'express';
import monitoringRoutes from './monitoring-routes';
import adminRoutes from './admin-routes';

const router = Router();

// Dashboard routes
router.use('/monitor', monitoringRoutes);
router.use('/admin', adminRoutes);

// Redirect root to admin dashboard
router.get('/', (req: Request, res: Response) => {
  res.redirect('/admin-dashboard.html');
});

// Serve dashboard HTML files
router.get('/crawl-dashboard.html', (req: Request, res: Response) => {
  const path = require('path');
  res.sendFile(path.join(__dirname, '../views/crawl-dashboard.html'));
});

router.get('/admin-dashboard.html', (req: Request, res: Response) => {
  const path = require('path');
  res.sendFile(path.join(__dirname, '../views/admin-dashboard.html'));
});

router.get('/admin-simple.html', (req: Request, res: Response) => {
  const path = require('path');
  res.sendFile(path.join(__dirname, '../views/admin-simple.html'));
});

router.get('/admin-table.html', (req: Request, res: Response) => {
  const path = require('path');
  res.sendFile(path.join(__dirname, '../views/admin-table.html'));
});

router.get('/admin-debug.html', (req: Request, res: Response) => {
  const path = require('path');
  res.sendFile(path.join(__dirname, '../views/admin-debug.html'));
});

// Serve static JavaScript files
router.use('/js', (req: Request, res: Response, next) => {
  const path = require('path');
  const express = require('express');
  const staticHandler = express.static(path.join(__dirname, '../static/js'));
  staticHandler(req, res, next);
});

export default router;