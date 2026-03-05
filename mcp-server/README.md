# PayVia MCP Server

MCP (Model Context Protocol) server that enables AI coding agents like Claude Code and GitHub Copilot to manage PayVia payment infrastructure.

## Features

- **Authentication** - Browser-based OAuth 2.0 with PKCE (no credentials through the agent)
- **Project Management** - Create and configure projects
- **Plan Management** - Create subscription plans with various billing intervals
- **PayPal Integration** - Configure PayPal credentials and sync plans
- **Subscriber Management** - Add, update, and manage subscribers
- **License Validation** - Check subscription status for end-users

## Installation

```bash
npm install -g @payvia-sdk/mcp-server
```

## Configuration

### Claude Code

Add to your Claude Code MCP settings (`~/.claude/settings.json` or project `.claude/settings.json`):

```json
{
  "mcpServers": {
    "payvia": {
      "command": "npx",
      "args": ["-y", "@payvia-sdk/mcp-server"]
    }
  }
}
```

### VS Code with Copilot (MCP Extension)

Configure in your MCP extension settings:

```json
{
  "mcp.servers": {
    "payvia": {
      "command": "npx",
      "args": ["-y", "@payvia-sdk/mcp-server"]
    }
  }
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PAYVIA_API_URL` | `https://api.payvia.site` | PayVia API endpoint |

### Token Storage

OAuth tokens are stored persistently at `~/.payvia/tokens.json` with secure file permissions (0700/0600). This means:
- You only need to authenticate once per machine
- Tokens are automatically refreshed when expired
- Use `payvia_logout` to clear stored tokens

## Available Tools

### Authentication

| Tool | Description |
|------|-------------|
| `payvia_auth` | Authenticate via browser OAuth (opens browser for login + consent) |
| `payvia_auth_status` | Check current authentication status and user info |
| `payvia_logout` | Clear stored authentication tokens |
| `payvia_register` | Open registration page in browser |

### Project Management

| Tool | Description |
|------|-------------|
| `payvia_list_projects` | List all projects |
| `payvia_create_project` | Create new project (returns API key) |
| `payvia_get_project` | Get project details |
| `payvia_update_project` | Update project name/description |
| `payvia_delete_project` | Delete project |
| `payvia_get_project_stats` | Get project statistics |

### API Key Management

| Tool | Description |
|------|-------------|
| `payvia_get_api_key` | Get API key prefix |
| `payvia_regenerate_api_key` | Generate new API key |

### PayPal Configuration

| Tool | Description |
|------|-------------|
| `payvia_get_paypal_config` | Get PayPal settings |
| `payvia_configure_paypal` | Set PayPal credentials |

### Plan Management

| Tool | Description |
|------|-------------|
| `payvia_list_plans` | List all plans |
| `payvia_create_plan` | Create subscription plan |
| `payvia_get_plan` | Get plan details |
| `payvia_update_plan` | Update plan |
| `payvia_delete_plan` | Delete plan |
| `payvia_sync_plan_to_paypal` | Sync to PayPal |

### Subscriber Management

| Tool | Description |
|------|-------------|
| `payvia_list_subscribers` | List all subscribers |
| `payvia_add_subscriber` | Add subscriber manually |
| `payvia_update_subscriber` | Update subscriber status |
| `payvia_delete_subscriber` | Remove subscriber |

### License Validation

| Tool | Description |
|------|-------------|
| `payvia_validate_license` | Check subscription status |
| `payvia_get_subscription_status` | Get detailed status |

### Configuration

| Tool | Description |
|------|-------------|
| `payvia_set_api_url` | Change API endpoint |

## Usage Example

Here's a typical workflow when integrating PayVia into a Chrome Extension:

```
Agent: I'll help you add PayVia payments to your extension.

1. First, let me authenticate with PayVia.
   → payvia_auth
   ✓ Browser opened for login. Authenticated as dev@example.com

2. Let me check your existing projects.
   → payvia_list_projects
   Found 0 projects. Creating a new one.

3. Creating a new project for your extension.
   → payvia_create_project(name: "My Extension")
   ✓ Project created! API Key: pv_xxxxx (save this!)

4. Now I'll create your subscription plans.
   → payvia_create_plan(projectId, name: "Pro Monthly", price: 9.99, interval: "Monthly")
   → payvia_create_plan(projectId, name: "Pro Yearly", price: 99, interval: "Yearly")

5. Configure PayPal to accept payments.
   → payvia_configure_paypal(projectId, clientId, clientSecret)

6. Sync plans to PayPal.
   → payvia_sync_plan_to_paypal(projectId, planId)

Now I'll integrate the PayVia SDK into your extension code...
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Run production build
npm start
```

## License

MIT
