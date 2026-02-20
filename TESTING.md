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
export MOONGATE_MCP_DEBUG=true

# Start the server
node dist/cli.js
```

The server will use stdio transport - it expects JSON-RPC messages on stdin.

### 3. Test with MCP Inspector

Install the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector
```

Then run your server through it:

```bash
MOONGATE_TOKEN="your-token" npx @modelcontextprotocol/inspector node dist/cli.js
```

This will open a web UI where you can:
- View available tools
- Test tool calls with parameters
- See request/response logs

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

Once Phase 1 works, test the OAuth flow.

### 1. Remove Manual Token

```bash
unset MOONGATE_TOKEN
rm -rf ~/.moongate-mcp
```

### 2. Start Server

```bash
node dist/cli.js
```

### 3. Expected Behavior

1. Server starts HTTP server on localhost:8787
2. Opens browser to login page
3. Click "Sign in with Google"
4. Redirects back with token
5. Server saves session and closes browser tab

### 4. Verify Session

```bash
cat ~/.moongate-mcp/session.json
```

Should show:
```json
{
  "token": "...",
  "publicKey": "...",
  "userId": "...",
  "authProvider": "google",
  "createdAt": 1234567890,
  "expiresAt": 1234567890
}
```

### 5. Test Token Refresh

Set expiry to near future:
```bash
# Edit session.json
# Set expiresAt to Date.now() + 3600000 (1 hour from now)
```

Then make a tool call - should auto-refresh.

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
