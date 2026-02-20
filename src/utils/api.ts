import axios, { AxiosInstance } from 'axios';

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
  return axios.create({
    baseURL: API_URL,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'x-platform': 'mcp', // Required by MoonGate API
    },
  });
}
