# TODO

## Phase 1: Core Implementation ✅
- [x] Project setup (TypeScript, tsup, package.json)
- [x] Session manager with manual token support
- [x] Core tools implementation
  - [x] get_wallet_address
  - [x] sign_message
  - [x] sign_transaction
  - [x] send_token
  - [x] get_portfolio
  - [x] swap_token
- [x] MCP server implementation (stdio transport)
- [x] CLI entry point
- [x] Documentation (README, TESTING)

## Phase 2: OAuth Browser Flow ✅
- [x] HTTP server for OAuth callback
- [x] Login page HTML with Google/Apple buttons
- [x] **Real Google Client ID integrated**
- [x] Google Sign-In flow ready
- [ ] Test Google Sign-In flow end-to-end (needs user testing)
- [ ] Implement Apple Sign-In (currently shows alert)
- [ ] Handle OAuth errors gracefully
- [ ] Add retry logic for failed auth

## Phase 3: Testing & Polish 🚧
- [ ] Test with Claude Desktop
- [ ] Test with Cursor
- [ ] Test all 6 tools with real wallet
- [ ] Test token refresh flow
- [ ] Test session persistence across restarts
- [ ] Handle edge cases (network errors, invalid params, etc.)
- [ ] Add integration tests
- [ ] Add example prompts to README

## Phase 4: npm Publishing 📦
- [ ] Choose package name (`@moongate/mcp-server` or `moongate-mcp-server`)
- [ ] Set up npm account / organization
- [ ] Test package installation from npm
- [ ] Add version bumping workflow
- [ ] Add GitHub Actions for CI/CD
- [ ] Add changelog generation

## Phase 5: Advanced Features 🔮
- [ ] NFT operations
  - [ ] List NFTs in wallet
  - [ ] Transfer NFTs
  - [ ] Get NFT metadata
- [ ] DeFi integrations
  - [ ] Stake SOL/tokens
  - [ ] Unstake with cooldown
  - [ ] Claim rewards
  - [ ] Lending/borrowing
- [ ] Transaction history
  - [ ] Get recent transactions
  - [ ] Filter by type/token
  - [ ] Parse transaction details
- [ ] Price feeds
  - [ ] Get token prices
  - [ ] Historical price data
  - [ ] Price alerts (via webhooks?)

## Known Issues

### Critical
- **Google Client ID**: Currently hardcoded as `YOUR_GOOGLE_CLIENT_ID` - need real value
- **Apple Sign-In**: Not implemented, shows alert

### Medium
- **Session file permissions**: Implemented but not tested on Windows
- **Token refresh timing**: Refresh within 1 hour of expiry - could be more aggressive
- **Error messages**: Need better user-facing error messages (not just raw API errors)

### Low
- **Logging**: Debug logs could be more structured (JSON?)
- **TypeScript types**: API responses not fully typed
- **Code organization**: Some files could be split further

## Documentation Needed
- [ ] Architecture diagram (session flow, tool registry, MCP integration)
- [ ] API endpoint reference
- [ ] Troubleshooting guide (expanded)
- [ ] Video demo / tutorial
- [ ] Blog post announcement

## Community
- [ ] Discord/Telegram for support
- [ ] Example AI prompts / cookbook
- [ ] Showcase gallery (what people built with it)
- [ ] Integration guides (Langchain, etc.)

## Future Ideas 💡
- Web UI for session management (view/revoke sessions)
- Multi-wallet support (switch between wallets)
- Transaction simulation before signing
- Hardware wallet integration?
- Mobile support (MCP on mobile?)
- Plugin system for custom tools
