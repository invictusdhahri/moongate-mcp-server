import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import http from 'http';
import open from 'open';
import { SessionData, AuthResponse } from './types.js';
import { logger } from '../utils/logger.js';
import { apiClient } from '../utils/api.js';

const SESSION_DIR = path.join(os.homedir(), '.moongate-mcp');
const SESSION_FILE = path.join(SESSION_DIR, 'session.json');
const TOKEN_REFRESH_THRESHOLD = 60 * 60 * 1000; // 1 hour in ms

export class SessionManager {
  private session: SessionData | null = null;
  private callbackPort: number;
  private apiUrl: string;

  constructor() {
    this.callbackPort = parseInt(process.env.MOONGATE_CALLBACK_PORT || '8787', 10);
    this.apiUrl = process.env.MOONGATE_API_URL || 'https://wallet.moongate.one';
  }

  /**
   * Initialize session - check for existing valid session or start OAuth flow
   */
  async initialize(): Promise<void> {
    // First check for manual token (for testing/dev)
    const manualToken = process.env.MOONGATE_TOKEN;
    if (manualToken) {
      logger.info('Using manual token from MOONGATE_TOKEN env var');
      // Validate the token by calling /api2/auth
      try {
        const response = await apiClient.get<AuthResponse>('/api2/auth', {
          headers: { Authorization: `Bearer ${manualToken}` },
        });
        
        let publicKey = response.data.publicKey;
        let userId = response.data.userId;
        
        // /api2/auth may not include publicKey/userId - fetch from getwalletaddress if needed
        if (!publicKey) {
          const walletRes = await apiClient.get<{ publicKey: string }>('/api2/getwalletaddress', {
            headers: { Authorization: `Bearer ${response.data.token}` },
          });
          publicKey = walletRes.data.publicKey;
        }
        
        this.session = {
          token: response.data.token,
          publicKey: publicKey || '',
          userId: userId || '',
          authProvider: 'manual',
          createdAt: Date.now(),
          expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
        };
        
        logger.info(`Authenticated with manual token. Public key: ${this.session.publicKey || '(not found)'}`);
        return;
      } catch (error) {
        logger.error('Failed to validate manual token:', error);
        throw new Error('Invalid MOONGATE_TOKEN');
      }
    }

    // Try to load existing session
    try {
      await this.ensureSessionDir();
      const data = await fs.readFile(SESSION_FILE, 'utf-8');
      this.session = JSON.parse(data);
      
      // Check if session is still valid
      if (this.session && this.isSessionValid()) {
        await this.refreshTokenIfNeeded();
        logger.info(`Loaded existing session. Public key: ${this.session.publicKey}`);
        return;
      }
    } catch (error) {
      // No existing session or invalid - need to authenticate
      logger.info('No valid session found, starting OAuth flow');
    }

    // Start OAuth flow
    await this.startOAuthFlow();
  }

  /**
   * Get current session (throws if not authenticated)
   */
  getSession(): SessionData {
    if (!this.session) {
      throw new Error('Not authenticated. Please run initialization first.');
    }
    return this.session;
  }

  /**
   * Get auth token for API calls (auto-refreshes if needed)
   */
  async getToken(): Promise<string> {
    if (!this.session) {
      throw new Error('Not authenticated');
    }

    await this.refreshTokenIfNeeded();
    return this.session.token;
  }

  /**
   * Check if current session is valid (not expired)
   */
  private isSessionValid(): boolean {
    if (!this.session) return false;
    return Date.now() < this.session.expiresAt;
  }

  /**
   * Refresh token if it's within 1 hour of expiring
   */
  private async refreshTokenIfNeeded(): Promise<void> {
    if (!this.session) return;

    const timeUntilExpiry = this.session.expiresAt - Date.now();
    
    if (timeUntilExpiry < TOKEN_REFRESH_THRESHOLD) {
      logger.info('Token expiring soon, refreshing...');
      
      try {
        const response = await apiClient.get<AuthResponse>('/api2/auth', {
          headers: { Authorization: `Bearer ${this.session.token}` },
        });

        this.session.token = response.data.token;
        this.session.expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // Reset expiry to 7 days
        
        await this.saveSession();
        logger.info('Token refreshed successfully');
      } catch (error) {
        logger.error('Failed to refresh token:', error);
        // Clear invalid session
        this.session = null;
        await this.clearSession();
        throw new Error('Session expired. Please authenticate again.');
      }
    }
  }

  /**
   * Start OAuth flow with browser
   */
  private async startOAuthFlow(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        if (req.url === '/') {
          // Serve the login page
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(this.getLoginPageHTML());
        } else if (req.url?.startsWith('/callback')) {
          // Handle OAuth callback
          const url = new URL(req.url, `http://localhost:${this.callbackPort}`);
          const token = url.searchParams.get('token');
          const publicKey = url.searchParams.get('publicKey');
          const userId = url.searchParams.get('userId');
          const provider = url.searchParams.get('provider') as 'google' | 'apple';

          if (!token || !publicKey || !userId) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<h1>Authentication failed</h1><p>Missing required parameters</p>');
            server.close();
            reject(new Error('OAuth callback missing parameters'));
            return;
          }

          // Save session
          this.session = {
            token,
            publicKey,
            userId,
            authProvider: provider,
            createdAt: Date.now(),
            expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
          };

          await this.saveSession();

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<h1>Authentication successful!</h1><p>You can close this window now.</p><script>window.close();</script>');
          
          server.close();
          logger.info(`Authenticated successfully. Public key: ${publicKey}`);
          resolve();
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });

      server.listen(this.callbackPort, async () => {
        const loginUrl = `http://localhost:${this.callbackPort}`;
        logger.info(`Opening browser for authentication: ${loginUrl}`);
        logger.info('Please log in with Google or Apple...');
        
        try {
          await open(loginUrl);
        } catch (error) {
          logger.error('Failed to open browser. Please manually navigate to:', loginUrl);
        }
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        server.close();
        reject(new Error('OAuth flow timed out after 5 minutes'));
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Generate the login page HTML
   */
  private getLoginPageHTML(): string {
    const callbackUrl = `http://localhost:${this.callbackPort}/callback`;
    
    return `<!DOCTYPE html>
<html>
<head>
  <title>MoonGate Login</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script src="https://accounts.google.com/gsi/client" async defer></script>
  <script src="https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js"></script>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .container {
      background: white;
      padding: 3rem;
      border-radius: 16px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      text-align: center;
      max-width: 400px;
      width: 90%;
    }
    h1 {
      margin: 0 0 0.5rem;
      color: #333;
      font-size: 28px;
    }
    p {
      color: #666;
      margin: 0 0 2rem;
    }
    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      padding: 12px;
      margin: 12px 0;
      border: 1px solid #ddd;
      border-radius: 8px;
      background: white;
      cursor: pointer;
      font-size: 16px;
      transition: all 0.2s;
    }
    .btn:hover {
      background: #f8f8f8;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    .btn img {
      width: 20px;
      height: 20px;
      margin-right: 12px;
    }
    .logo {
      width: 60px;
      height: 60px;
      margin: 0 auto 1rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">🌙</div>
    <h1>MoonGate Login</h1>
    <p>Sign in to connect your wallet</p>
    
    <div id="google-btn" class="btn">
      <img src="https://upload.wikimedia.org/wikipedia/commons/5/53/Google_%22G%22_Logo.svg" alt="Google">
      Sign in with Google
    </div>
    
    <div id="apple-btn" class="btn">
      <img src="https://upload.wikimedia.org/wikipedia/commons/f/fa/Apple_logo_black.svg" alt="Apple">
      Sign in with Apple
    </div>
  </div>

  <script>
    const API_URL = '${this.apiUrl}';
    const CALLBACK_URL = '${callbackUrl}';

    // Google Sign-In
    function handleGoogleCallback(response) {
      const idToken = response.credential;
      
      fetch(API_URL + '/api1/verifygoogle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: idToken })
      })
      .then(res => res.json())
      .then(data => {
        if (data.token) {
          const params = new URLSearchParams({
            token: data.token,
            publicKey: data.publicKey || '',
            userId: data.userId || '',
            provider: 'google'
          });
          window.location.href = CALLBACK_URL + '?' + params.toString();
        } else {
          alert('Authentication failed: ' + (data.error || 'Unknown error'));
        }
      })
      .catch(err => {
        console.error('Google auth error:', err);
        alert('Authentication failed. Please try again.');
      });
    }

    // Initialize Google Sign-In
    window.onload = function() {
      google.accounts.id.initialize({
        client_id: 'YOUR_GOOGLE_CLIENT_ID', // TODO: Get from MoonGate
        callback: handleGoogleCallback
      });

      document.getElementById('google-btn').onclick = function() {
        google.accounts.id.prompt();
      };

      // Apple Sign-In
      document.getElementById('apple-btn').onclick = function() {
        // TODO: Implement Apple Sign-In
        alert('Apple Sign-In coming soon. Please use Google for now.');
      };
    };
  </script>
</body>
</html>`;
  }

  /**
   * Save session to disk
   */
  private async saveSession(): Promise<void> {
    if (!this.session) return;
    
    await this.ensureSessionDir();
    await fs.writeFile(SESSION_FILE, JSON.stringify(this.session, null, 2), { mode: 0o600 });
    logger.debug('Session saved to disk');
  }

  /**
   * Clear session from disk
   */
  private async clearSession(): Promise<void> {
    try {
      await fs.unlink(SESSION_FILE);
      logger.debug('Session cleared from disk');
    } catch (error) {
      // Ignore if file doesn't exist
    }
  }

  /**
   * Ensure session directory exists
   */
  private async ensureSessionDir(): Promise<void> {
    try {
      await fs.mkdir(SESSION_DIR, { recursive: true, mode: 0o700 });
    } catch (error) {
      // Ignore if already exists
    }
  }
}
