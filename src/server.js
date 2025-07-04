/**
 * Simple health check endpoint for monitoring
 */

import http from 'http';
import AOPriceOracleService from './oracle-service.js';

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'healthy',
            service: 'lncp-credits payment token price oracle - ao',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: '1.0.0'
        }));
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
    }
});

// Start the health check server
server.listen(PORT, () => {
    console.log(`Health check server running on port ${PORT}`);
});

// Start the oracle service
const oracleService = new AOPriceOracleService();

// Handle graceful shutdown
const shutdown = (signal) => {
    console.log(`\n Received ${signal}, shutting down gracefully...`);
    
    // Stop the oracle service
    oracleService.stop();
    
    // Close the HTTP server
    server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
    });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Start the oracle service
oracleService.start().catch(error => {
    console.error('Failed to start oracle service:', error.message);
    process.exit(1);
});

export { server, oracleService };
