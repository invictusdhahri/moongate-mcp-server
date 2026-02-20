import axios, { AxiosInstance } from 'axios';
import { logger } from './logger.js';

const API_URL = process.env.MOONGATE_API_URL || 'https://wallet.moongate.one';

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'x-platform': 'mcp', // Required by MoonGate API
  },
});

/**
 * Create an authenticated API client with the given token
 */
export function createAuthenticatedClient(token: string): AxiosInstance {
  const client = axios.create({
    baseURL: API_URL,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'x-platform': 'mcp', // Required by MoonGate API
    },
  });

  // Add request interceptor for debugging
  client.interceptors.request.use((config) => {
    logger.info(`API Request: ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
    logger.debug('Headers:', JSON.stringify(config.headers, null, 2));
    if (config.data) {
      logger.debug('Body:', JSON.stringify(config.data, null, 2));
    }
    return config;
  });

  // Add response interceptor for debugging
  client.interceptors.response.use(
    (response) => {
      logger.info(`API Response: ${response.status} ${response.statusText}`);
      return response;
    },
    (error) => {
      logger.error(`API Error: ${error.response?.status} ${error.response?.statusText}`);
      logger.error('Error data:', JSON.stringify(error.response?.data, null, 2));
      return Promise.reject(error);
    }
  );

  return client;
}
