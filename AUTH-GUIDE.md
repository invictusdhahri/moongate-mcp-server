# Authentication Guide

## Why Manual Tokens?

MoonGate's OAuth endpoints are designed for their internal apps, not third-party MCP servers. The most reliable way to authenticate is using a session token from your actual MoonGate wallet session in the browser.

## Step-by-Step: Get Your Token

### 1. Open MoonGate Wallet

Go to [wallet.moongate.one](https://wallet.moongate.one) and log in with your Google or Apple account.

### 2. Open Developer Tools

**Chrome/Brave/Edge:**
- Press `F12` or `Cmd+Option+I` (Mac) / `Ctrl+Shift+I` (Windows/Linux)
- Or right-click anywhere → **Inspect**

**Firefox:**
- Press `F12` or `Cmd+Option+I` (Mac) / `Ctrl+Shift+I` (Windows/Linux)

**Safari:**
- Enable Developer menu: Safari → Settings → Advanced → "Show Develop menu"
- Press `Cmd+Option+I`

### 3. Navigate to Local Storage

1. Click the **Application** tab (Chrome/Brave/Edge) or **Storage** tab (Firefox)
2. In the left sidebar, expand **Local Storage**
3. Click on `https://wallet.moongate.one`

### 4. Find and Copy the Token

1. In the key-value list, find the row with key **`token`**
2. Click the value (long string starting with `ey...`)
3. Copy the entire value

**What it looks like:**
```
eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ...
```

### 5. Use the Token

**For Claude Desktop:**

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "moongate": {
      "command": "npx",
      "args": ["-y", "@moongate/mcp-server"],
      "env": {
        "MOONGATE_TOKEN": "PASTE_YOUR_TOKEN_HERE"
      }
    }
  }
}
```

**For Terminal/CLI Testing:**

```bash
export MOONGATE_TOKEN="PASTE_YOUR_TOKEN_HERE"
npx @moongate/mcp-server
```

**For Development (`.env` file):**

Create a `.env` file in the project root:

```env
MOONGATE_TOKEN=PASTE_YOUR_TOKEN_HERE
```

Then run:

```bash
npm run dev
```

## Token Expiration

MoonGate tokens expire after **7 days**. When you see authentication errors:

1. Check if you're still logged in at wallet.moongate.one
2. Extract a fresh token using the steps above
3. Update your `MOONGATE_TOKEN` value
4. Restart Claude Desktop or your MCP client

## Security Notes

- **Never share your token** - it gives full access to your wallet
- Tokens are stored locally in your MCP config (user-only permissions)
- Tokens are JWT format - they contain your user ID and wallet info
- If compromised, log out from wallet.moongate.one to invalidate all tokens

## Troubleshooting

### Can't find the Application tab

- **Chrome/Brave/Edge:** Make sure DevTools is wide enough, or click the `>>` arrows to see hidden tabs
- **Firefox:** It's called **Storage** instead of **Application**
- **Safari:** It's called **Storage** in the Web Inspector

### Token key doesn't exist

Make sure you're logged into wallet.moongate.one. If you see a login page instead of your wallet, you need to authenticate first.

### Token gives "Invalid" error

1. Make sure you copied the entire value (no spaces or line breaks)
2. Check that you're still logged in to wallet.moongate.one
3. Try logging out and back in, then get a fresh token

### Still stuck?

Open an issue at [github.com/invictusdhahri/moongate-mcp-server](https://github.com/invictusdhahri/moongate-mcp-server/issues) with:
- What step you're stuck on
- Any error messages you see
- Browser and OS version
