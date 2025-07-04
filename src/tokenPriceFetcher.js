/**
 * Payment Token Price Fetcher
 * Fetches the latest payment token price from Arweave using RedStone oracles
 * Payment token: $AO
 */

class TokenPriceFetcher {
    constructor() {
        this.arweaveGraphQLEndpoint = 'https://arweave.net/graphql';
        this.arweaveDataEndpoint = 'https://arweave.net';
    }

    /**
     * GraphQL query to fetch the latest payment token price transaction
     */
    getGraphQLQuery() {
        return {
            query: `
                query {
                    transactions(
                        sort: HEIGHT_DESC,
                        first: 1,
                        tags: [
                            {
                                name: "type",
                                values: ["redstone-oracles"]
                            },
                            {
                                name: "dataFeedId",
                                values: ["AO"]
                            },
                            {
                                name: "dataServiceId",
                                values: ["redstone-primary-prod"]
                            }
                        ],
                        owners: ["I-5rWUehEv-MjdK9gFw09RxfSLQX9DIHxG614Wf8qo0"]
                    ) {
                        edges {
                            node {
                                id
                                tags {
                                    name
                                    value
                                }
                                owner {
                                    address
                                    key
                                }
                            }
                        }
                    }
                }
            `
        };
    }

    /**
     * Fetch the latest transaction id containing payment price data
     * @returns {Promise<string>} 
     */
    async fetchLatestTransactionId() {
        try {
            const response = await fetch(this.arweaveGraphQLEndpoint, {
                method: 'POST',
                headers: {
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Connection': 'keep-alive',
                    'DNT': '1',
                    'Origin': 'https://arweave.net'
                },
                body: JSON.stringify(this.getGraphQLQuery())
            });

            if (!response.ok) {
                throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            
            if (!data.data?.transactions?.edges?.length) {
                throw new Error('No transactions found');
            }

            const transactionId = data.data.transactions.edges[0].node.id;
            console.log(`Latest transaction ID: ${transactionId}`);
            
            return transactionId;
        } catch (error) {
            console.error('Error fetching transaction ID:', error);
            throw error;
        }
    }

    /**
     * Fetch price data from a specific transaction
     * @param {string} transactionId - The Arweave transaction ID
     * @returns {Promise<Object>} Price data object
     */
    async fetchPriceData(transactionId) {
        try {
            const url = `${this.arweaveDataEndpoint}/${transactionId}`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Failed to fetch price data: ${response.status} ${response.statusText}`);
            }

            const priceData = await response.json();
            console.log('Price data fetched successfully');
            
            return priceData;
        } catch (error) {
            console.error('Error fetching price data:', error);
            throw error;
        }
    }

    /**
     * Extract the payment token price from the price data
     * @param {Object} priceData - The price data object
     * @returns {number} payment token price
     */
    extractPrice(priceData) {
        try {
            if (!priceData.dataPoints || !Array.isArray(priceData.dataPoints) || priceData.dataPoints.length === 0) {
                throw new Error('Invalid price data structure: no dataPoints found');
            }

            const aoDataPoint = priceData.dataPoints.find(dp => dp.dataFeedId === 'AO');
            
            if (!aoDataPoint) {
                throw new Error('AO data point not found in price data');
            }

            const price = aoDataPoint.value;
            
            if (typeof price !== 'number' || isNaN(price)) {
                throw new Error('Invalid price value');
            }

            return price;
        } catch (error) {
            console.error('Error extracting price:', error);
            throw error;
        }
    }

    /**
     * Fetch the current payment token price
     * @returns {Promise<number>} Current payment token price
     */
    async fetchAOTokenPrice() {
        try {
            console.log('Fetching payment token price...');
            
            const transactionId = await this.fetchLatestTransactionId();
            const priceData = await this.fetchPriceData(transactionId);
            const price = this.extractPrice(priceData);
            
            console.log(`AO Token Price: $${price}`);
            return price;
            
        } catch (error) {
            console.error('Failed to fetch AO token price:', error);
            throw error;
        }
    }

    /**
     * Get detailed price information including metadata
     * @returns {Promise<Object>} Detailed price information
     */
    async fetchDetailedPriceInfo() {
        try {
            
            const transactionId = await this.fetchLatestTransactionId();
            const priceData = await this.fetchPriceData(transactionId);
            const price = this.extractPrice(priceData);
            
            const aoDataPoint = priceData.dataPoints.find(dp => dp.dataFeedId === 'AO');
            
            return {
                price,
                timestamp: new Date(priceData.timestampMilliseconds),
                transactionId,
                metadata: aoDataPoint.metadata,
                dataServiceId: priceData.dataServiceId,
                signerAddress: priceData.signerAddress,
                isSignatureValid: priceData.isSignatureValid
            };
            
        } catch (error) {
            console.error('Failed to fetch detailed price info:', error);
            throw error;
        }
    }
}

export default TokenPriceFetcher;

