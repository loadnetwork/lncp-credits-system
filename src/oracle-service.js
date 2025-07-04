/**
 * payment Token Price Oracle Service
 * Fetches payment token (AO) token price and updates the credits process every 60s using aoconnect
 */

import { connect, createDataItemSigner } from '@permaweb/aoconnect';
import dotenv from 'dotenv';
import TokenPriceFetcher from './tokenPriceFetcher.js';
import { PROCESS_ID, CRONJOB_INTERVAL } from './constants.js';

dotenv.config();

class AOPriceOracleService {
    constructor() {
        this.fetcher = new TokenPriceFetcher();
        this.processId = PROCESS_ID;
        this.updateInterval = CRONJOB_INTERVAL;
        this.intervalId = null;
        this.isRunning = false;
        
        // Initialize aoconnect
        this.ao = connect();
        
        // Initialize signer from environment variable
        this.initializeSigner();
        
        // Bind methods to preserve context
        this.updatePrice = this.updatePrice.bind(this);
        this.start = this.start.bind(this);
        this.stop = this.stop.bind(this);
    }

    /**
     * Initialize the data item signer from environment variable
     */
    initializeSigner() {
        try {
            const oraclePk = process.env.ORACLE_PK;
            
            if (!oraclePk) {
                throw new Error('ORACLE_PK environment variable is required');
            }

            // Parse the JWK from environment variable
            let jwk;
            try {
                jwk = JSON.parse(oraclePk);
            } catch (parseError) {
                throw new Error('ORACLE_PK must be a valid JSON Web Key (JWK)');
            }

            // Validate JWK structure
            if (!jwk.kty || !jwk.n || !jwk.e || !jwk.d) {
                throw new Error('Invalid JWK format in ORACLE_PK');
            }

            this.signer = createDataItemSigner(jwk);
            console.log('Oracle signer initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize signer:', error.message);
            process.exit(1);
        }
    }

    /**
     * Fetch the current payment token price and update the credits process
     */
    async updatePrice() {
        try {
            console.log(`[${new Date().toISOString()}] Fetching AO token price...`);
            
            // Fetch the current price
            const price = await this.fetcher.fetchAOTokenPrice();
            console.log(`Current AO Token Price: $${price.toFixed(6)}`);

            // Send message to update the price in the credits process
            const messageId = await this.ao.message({
                process: this.processId,
                tags: [
                    { name: 'Action', value: 'UpdatePaymentTokenPrice' },
                    { name: 'Price', value: price.toString() }
                ],
                signer: this.signer
            });

            console.log(`Price update message sent: ${messageId}`);

            // Get the result of the message
            const result = await this.ao.result({
                message: messageId,
                process: this.processId
            });

            if (result.Messages && result.Messages.length > 0) {
                const responseMessage = result.Messages[0];
                if (responseMessage.Tags['Updated-Payment-Token-Price']) {
                    console.log(`Price updated successfully in process: $${responseMessage.Tags['Updated-Payment-Token-Price']}`);
                } else {
                    console.log('Update message processed, response:', responseMessage);
                }
            } else {
                console.log('Price update message processed successfully');
            }

        } catch (error) {
            console.error('Error updating price:', error.message);
            
            // Log additional error details for debugging
            if (error.response) {
                console.error('Response status:', error.response.status);
                console.error('Response data:', error.response.data);
            }
        }
    }

    /**
     * Start the oracle service
     */
    async start() {
        if (this.isRunning) {
            console.log('Oracle service is already running');
            return;
        }

        console.log('Starting AO Token Price Oracle Service...');
        console.log(`Target Process ID: ${this.processId}`);
        console.log(`Update Interval: ${this.updateInterval / 1000} seconds`);
        
        // Perform initial price update
        await this.updatePrice();
        
        // Set up recurring updates
        this.intervalId = setInterval(this.updatePrice, this.updateInterval);
        this.isRunning = true;
        
        console.log('Oracle service started successfully');
        console.log('Press Ctrl+C to stop the service');
    }

    /**
     * Stop the oracle service
     */
    stop() {
        if (!this.isRunning) {
            console.log('Oracle service is not running');
            return;
        }

        console.log('Stopping AO Token Price Oracle Service...');
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        
        this.isRunning = false;
        console.log('Oracle service stopped successfully');
    }

    /**
     * Get service status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            processId: this.processId,
            updateInterval: this.updateInterval,
            intervalId: this.intervalId
        };
    }

    /**
     * Perform a one-time price update (useful for testing)
     */
    async performSingleUpdate() {
        console.log('Performing single price update...');
        await this.updatePrice();
    }
}

// Handle graceful shutdown
function setupGracefulShutdown(oracleService) {
    const shutdown = (signal) => {
        console.log(`\nReceived ${signal}, shutting down gracefully...`);
        oracleService.stop();
        process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Main execution
async function main() {
    try {
        const oracleService = new AOPriceOracleService();
        
        // Setup graceful shutdown
        setupGracefulShutdown(oracleService);
        
        // Check if running in single-update mode
        const args = process.argv.slice(2);
        if (args.includes('--once')) {
            await oracleService.performSingleUpdate();
            process.exit(0);
        }
        
        // Start the service
        await oracleService.start();
        
    } catch (error) {
        console.error('Failed to start oracle service:', error.message);
        process.exit(1);
    }
}

// Export for use in other modules
export default AOPriceOracleService;

// // Run the service if this file is executed directly
// if (import.meta.url === `file://${process.argv[1]}`) {
//     main();
// }
