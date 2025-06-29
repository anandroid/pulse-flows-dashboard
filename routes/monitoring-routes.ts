import { Request, Response, Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

interface CrawlStatus {
  areas: string[];
  isRunning: boolean;
  startTime?: string;
  currentArea?: string;
  currentConfig?: string;
  progress?: {
    totalAreas: number;
    completedAreas: number;
    currentAreaProgress?: {
      totalConfigs: number;
      completedConfigs: number;
    };
  };
}

interface LogEntry {
  area: string;
  timestamp: string;
  filename: string;
  size: string;
  status: 'completed' | 'running' | 'failed';
  fullPath?: string;
  modified?: string;
  isLive?: boolean;
}

// In-memory store for tracking running crawls
const runningCrawls = new Map<string, CrawlStatus>();

// Get current crawl status for all areas
router.get('/status', (req: Request, res: Response) => {
  try {
    const allStatuses: { [key: string]: CrawlStatus } = {};
    
    // Convert Map to object for JSON response
    for (const [key, status] of runningCrawls.entries()) {
      allStatuses[key] = status;
    }
    
    return res.json({
      success: true,
      crawls: allStatuses,
      totalRunning: runningCrawls.size
    });
  } catch (error) {
    console.error('Error getting crawl status:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get status'
    });
  }
});

// Get logs for a specific area or all areas
router.get('/logs', (req: Request, res: Response) => {
  try {
    const { area } = req.query;
    const logsDir = path.join(process.cwd(), 'logs');
    const serverLogPath = path.join(process.cwd(), 'server.log');
    
    let logFiles: LogEntry[] = [];
    
    // Add server.log if it exists
    if (fs.existsSync(serverLogPath)) {
      const stats = fs.statSync(serverLogPath);
      logFiles.push({
        area: 'server',
        timestamp: new Date().toISOString().replace(/[:\-]/g, '').replace('T', '_').substring(0, 15),
        filename: 'server.log',
        size: formatFileSize(stats.size),
        status: 'running' as const,
        fullPath: serverLogPath,
        modified: stats.mtime.toISOString(),
        isLive: true
      });
    }
    
    // Add crawl logs if directory exists
    if (fs.existsSync(logsDir)) {
      const crawlLogFiles = fs.readdirSync(logsDir)
        .filter(file => file.startsWith('crawl_') && file.endsWith('.log'))
        .map(file => {
          const filePath = path.join(logsDir, file);
          const stats = fs.statSync(filePath);
          
          // Extract timestamp from filename: crawl_YYYYMMDD_HHMMSS.log
          const timestampMatch = file.match(/crawl_(\d{8}_\d{6})\.log/);
          const timestamp = timestampMatch ? timestampMatch[1] : '';
          
          // Try to determine area from log content (first few lines)
          let logArea = 'unknown';
          let status: 'completed' | 'running' | 'failed' = 'completed';
          
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n').slice(0, 50); // Check first 50 lines
            
            // Look for area processing lines
            for (const line of lines) {
              const areaMatch = line.match(/📍 Processing (?:specific )?areas?: (.+)/);
              if (areaMatch) {
                logArea = areaMatch[1].split(',')[0].trim().toLowerCase();
                break;
              }
              const singleAreaMatch = line.match(/📍 ([A-Z]+)$/);
              if (singleAreaMatch) {
                logArea = singleAreaMatch[1].toLowerCase();
                break;
              }
            }
            
            // Determine status
            if (content.includes('🎉 JOB COMPLETE') || content.includes('✅ Complete')) {
              status = 'completed';
            } else if (content.includes('❌') || content.includes('Error') || content.includes('Failed')) {
              status = 'failed';
            } else if (content.length < 1000) { // Very short logs might be failed
              status = 'failed';
            }
          } catch (err) {
            console.warn(`Failed to read log ${file}:`, err);
          }
          
          return {
            area: logArea,
            timestamp: timestamp,
            filename: file,
            size: formatFileSize(stats.size),
            status: status,
            fullPath: filePath,
            modified: stats.mtime.toISOString()
          };
        });
      
      logFiles = logFiles.concat(crawlLogFiles);
    }
    
    // Sort by modified time (most recent first)
    logFiles.sort((a, b) => {
      const bTime = b.modified ? new Date(b.modified).getTime() : 0;
      const aTime = a.modified ? new Date(a.modified).getTime() : 0;
      return bTime - aTime;
    });
    
    // Filter by area if specified
    const filteredLogs = area 
      ? logFiles.filter(log => log.area === area || log.area === 'unknown' || log.area === 'server')
      : logFiles;
    
    return res.json({
      success: true,
      logs: filteredLogs,
      total: filteredLogs.length,
      hasServerLog: fs.existsSync(serverLogPath)
    });
  } catch (error) {
    console.error('Error getting logs:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get logs'
    });
  }
});

// Get specific log content
router.get('/logs/:filename', (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const { tail, live } = req.query;
    
    // Special case for live server logs
    if (filename === 'server.log') {
      const serverLogPath = path.join(process.cwd(), 'server.log');
      
      if (!fs.existsSync(serverLogPath)) {
        return res.status(404).json({
          success: false,
          error: 'Server log file not found'
        });
      }
      
      let content = fs.readFileSync(serverLogPath, 'utf8');
      
      // If tail is specified, return only the last N lines
      if (tail) {
        const lines = content.split('\n');
        const tailCount = parseInt(tail as string, 10) || 100;
        content = lines.slice(-tailCount).join('\n');
      }
      
      return res.json({
        success: true,
        filename: 'server.log',
        content,
        size: formatFileSize(fs.statSync(serverLogPath).size),
        isLive: true
      });
    }
    
    // Validate filename to prevent path traversal
    if (!filename.match(/^crawl_\d{8}_\d{6}\.log$/)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid log filename'
      });
    }
    
    const logPath = path.join(process.cwd(), 'logs', filename);
    
    if (!fs.existsSync(logPath)) {
      return res.status(404).json({
        success: false,
        error: 'Log file not found'
      });
    }
    
    let content = fs.readFileSync(logPath, 'utf8');
    
    // If tail is specified, return only the last N lines
    if (tail) {
      const lines = content.split('\n');
      const tailCount = parseInt(tail as string, 10) || 100;
      content = lines.slice(-tailCount).join('\n');
    }
    
    return res.json({
      success: true,
      filename,
      content,
      size: formatFileSize(fs.statSync(logPath).size)
    });
  } catch (error) {
    console.error('Error reading log file:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to read log'
    });
  }
});

// Get live server logs
router.get('/logs/live/server', (req: Request, res: Response) => {
  try {
    const { tail = '200' } = req.query;
    const serverLogPath = path.join(process.cwd(), 'server.log');
    
    if (!fs.existsSync(serverLogPath)) {
      return res.json({
        success: true,
        content: 'Server log not found. Server may be running in foreground mode.',
        size: '0 B',
        timestamp: new Date().toISOString()
      });
    }
    
    let content = fs.readFileSync(serverLogPath, 'utf8');
    
    // Return last N lines
    const lines = content.split('\n');
    const tailCount = parseInt(tail as string, 10) || 200;
    content = lines.slice(-tailCount).join('\n');
    
    return res.json({
      success: true,
      content,
      size: formatFileSize(fs.statSync(serverLogPath).size),
      timestamp: new Date().toISOString(),
      lines: lines.length,
      tailLines: Math.min(tailCount, lines.length)
    });
  } catch (error) {
    console.error('Error reading live server logs:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to read live logs'
    });
  }
});

// Start tracking a crawl (called by crawl scripts)
router.post('/track/start', (req: Request, res: Response) => {
  try {
    const { areas, crawlId } = req.body;
    
    if (!areas || !crawlId) {
      return res.status(400).json({
        success: false,
        error: 'Areas and crawlId are required'
      });
    }
    
    const status: CrawlStatus = {
      areas: Array.isArray(areas) ? areas : [areas],
      isRunning: true,
      startTime: new Date().toISOString(),
      progress: {
        totalAreas: Array.isArray(areas) ? areas.length : 1,
        completedAreas: 0
      }
    };
    
    runningCrawls.set(crawlId, status);
    
    return res.json({
      success: true,
      crawlId,
      message: 'Crawl tracking started'
    });
  } catch (error) {
    console.error('Error starting crawl tracking:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start tracking'
    });
  }
});

// Update crawl progress
router.post('/track/progress', (req: Request, res: Response) => {
  try {
    const { crawlId, currentArea, currentConfig, completedAreas, currentAreaProgress } = req.body;
    
    if (!crawlId) {
      return res.status(400).json({
        success: false,
        error: 'CrawlId is required'
      });
    }
    
    const status = runningCrawls.get(crawlId);
    if (!status) {
      return res.status(404).json({
        success: false,
        error: 'Crawl not found'
      });
    }
    
    // Update status
    if (currentArea) status.currentArea = currentArea;
    if (currentConfig) status.currentConfig = currentConfig;
    if (completedAreas !== undefined) status.progress!.completedAreas = completedAreas;
    if (currentAreaProgress) status.progress!.currentAreaProgress = currentAreaProgress;
    
    return res.json({
      success: true,
      message: 'Progress updated'
    });
  } catch (error) {
    console.error('Error updating crawl progress:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update progress'
    });
  }
});

// End crawl tracking
router.post('/track/end', (req: Request, res: Response) => {
  try {
    const { crawlId } = req.body;
    
    if (!crawlId) {
      return res.status(400).json({
        success: false,
        error: 'CrawlId is required'
      });
    }
    
    runningCrawls.delete(crawlId);
    
    return res.json({
      success: true,
      message: 'Crawl tracking ended'
    });
  } catch (error) {
    console.error('Error ending crawl tracking:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to end tracking'
    });
  }
});

// Helper function to format file sizes
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default router;