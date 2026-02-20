# Testing Guide

## Phase 1: Manual Token Testing

Before implementing the full OAuth flow, test with a manual JWT token.

### 1. Get a Test Token

1. Go to https://wallet.moongate.one
2. Sign in with Google or Apple
3. Open browser DevTools (F12)
4. Go to Application > Local Storage > https://wallet.moongate.one
5. Copy the `token` value

### 2. Test Locally

```bash
# Export the token
export MOONGATE_TOKEN="your-jwt-token-here"

# Start the server (debug logging is ON by default)
node dist/cli.js

# To disable verbose logs:
# export MOONGATE_MCP_DEBUG=false
```

The server will use stdio transport - it expects JSON-RPC messages on stdin.

### 3. Test with MCP Inspector (Recommended!)

The MCP Inspector provides a nice web UI to test your server:

```bash
# With manual token
MOONGATE_TOKEN="your-token" npx @modelcontextprotocol/inspector node dist/cli.js

# Or without token (will trigger OAuth flow)
npx @modelcontextprotocol/inspector node dist/cli.js
```

This will open a browser where you can:
- View available tools in a clean UI
- Test tool calls with a form (no need to write JSON)
- See request/response logs in real-time
- Debug errors with full stack traces
- Much easier than testing via Claude Desktop!

**Note:** Debug logging is enabled by default, so you'll see detailed logs in the terminal even when using the Inspector UI.

### 4. Test Individual Tools

#### Get Wallet Address
```json
{
  "method": "tools/call",
  "params": {
    "name": "get_wallet_address",
    "arguments": {}
  }
}
```

#### Sign Message
```json
{
  "method": "tools/call",
  "params": {
    "name": "sign_message",
    "arguments": {
      "message": "Hello from MCP!"
    }
  }
}
```

#### Get Portfolio
```json
{
  "method": "tools/call",
  "params": {
    "name": "get_portfolio",
    "arguments": {}
  }
}
```

## Phase 2: OAuth Flow Testing

OAuth is now ready with real Google Client ID!

### 1. Remove Manual Token

```bash
unset MOONGATE_TOKEN
rm -rf ~/.moongate-mcp
```

### 2. Start Server

```bash
# With MCP Inspector
npx @modelcontextprotocol/inspector node dist/cli.js

# Or standalone
node dist/cli.js
```

### 3. Expected Behavior

1. Server starts HTTP server on `localhost:8787`
2. Opens browser to http://localhost:8787
3. You see MoonGate login page with Google/Apple buttons
4. Click **"Sign in with Google"**
5. Google Sign-In popup appears
6. After signing in, Google sends ID token to MoonGate
7. MoonGate verifies and returns session token
8. Browser redirects to `/callback` with token
9. Server saves session to `~/.moongate-mcp/session.json`
10. Browser shows "Authentication successful! You can close this window"

### 4. Verify Session

```bash
cat ~/.moongate-mcp/session.json
```

Should show:
```json
{
  "token": "eyJhbGci...",
  "publicKey": "AqnoB...",
  "userId": "5ede0172...",
  "authProvider": "google",
  "createdAt": 1740000000000,
  "expiresAt": 1740604800000
}
```

### 5. Test Authenticated Calls

Try any tool - it should work without prompting for auth again:

```bash
# In MCP Inspector, call get_wallet_address
# Should return your public key without re-authenticating
```

### 6. Test Token Refresh

The server auto-refreshes tokens within 1 hour of expiry.

To test refresh:
```bash
# Edit session.json and change expiresAt to 1 hour from now
# Date.now() + 3600000
```

Then make a tool call - you'll see in logs:
```
[INFO] Token expiring soon, refreshing...
[INFO] Token refreshed successfully
```

### 7. Test Session Persistence

1. Close the MCP server
2. Restart it
3. Make a tool call
4. Should work without re-authenticating (loads session from file)

## Phase 3: Claude Desktop Integration

### 1. Configure Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "moongate": {
      "command": "node",
      "args": ["/path/to/moongate-mcp-server/dist/cli.js"],
      "env": {
        "MOONGATE_MCP_DEBUG": "true"
      }
    }
  }
}
```

### 2. Restart Claude Desktop

Completely quit and restart Claude Desktop app.

### 3. Test in Chat

Ask Claude:
```
Can you get my MoonGate wallet address?
```

Claude should:
1. Trigger the OAuth flow (if no session)
2. Call `get_wallet_address` tool
3. Return your public key

### 4. Test Other Tools

```
Can you show me my portfolio?
```

```
Sign this message: "Hello from Claude!"
```

## Common Issues

### Port Already in Use

If port 8787 is taken:

```bash
export MOONGATE_CALLBACK_PORT=9999
```

### OAuth Timeout

Default timeout is 5 minutes. If you need longer:
- Edit `src/session/manager.ts`
- Find `setTimeout(() => { ... }, 5 * 60 * 1000)`
- Increase timeout

### Token Expired

Delete session and re-authenticate:

```bash
rm ~/.moongate-mcp/session.json
```

### Google Client ID Missing

The login page needs MoonGate's Google Client ID. For now, it's hardcoded as `YOUR_GOOGLE_CLIENT_ID`.

To get the real one:
1. Check MoonGate web app source
2. Look for Google Sign-In initialization
3. Copy the client ID

Or ask MoonGate team for the client ID.

## Debugging

### Enable Debug Logs

```bash
export MOONGATE_MCP_DEBUG=true
```

### Check MCP Protocol Messages

Use the MCP Inspector (see above) to see all JSON-RPC traffic.

### API Errors

All API errors are logged to stderr with full response data:

```
[ERROR] Failed to get wallet address: {"error": "Unauthorized"}
```

Check:
- Is token valid? (test with `GET /api2/auth`)
- Is API URL correct? (default: https://wallet.moongate.one)
- Network issues?

## Next Steps

Once testing is complete:

1. **Fix Google Client ID**: Get real client ID from MoonGate
2. **Add Apple Sign-In**: Implement Apple OAuth flow
3. **Test Error Cases**: Invalid tokens, network failures, etc.
4. **Performance**: Test with multiple rapid tool calls
5. **Publish to npm**: `npm publish --access public`
