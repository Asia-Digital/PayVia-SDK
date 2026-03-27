#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { loadTokens, clearTokens, isTokenExpired } from "./token-storage.js";
import { startOAuthFlow, refreshAccessToken } from "./oauth-flow.js";

// Configuration
const DEFAULT_API_URL = process.env.PAYVIA_API_URL || "https://api.payvia.site";

// State management
interface SessionState {
  accessToken: string | null;
  apiUrl: string;
}

const state: SessionState = {
  accessToken: null,
  apiUrl: DEFAULT_API_URL,
};

// Load persisted tokens on startup
function initializeAuth(): void {
  const tokens = loadTokens();
  if (tokens && tokens.apiUrl === state.apiUrl) {
    if (!isTokenExpired(tokens)) {
      state.accessToken = tokens.accessToken;
      console.error("Loaded existing PayVia authentication.");
    } else {
      console.error("Stored token expired. Will attempt refresh on next API call.");
    }
  }
}

// Refresh mutex to prevent concurrent refreshes
let refreshPromise: Promise<void> | null = null;

async function ensureValidToken(): Promise<void> {
  if (state.accessToken) {
    const tokens = loadTokens();
    if (tokens && !isTokenExpired(tokens)) return;
  }

  // Try to refresh
  const tokens = loadTokens();
  if (!tokens?.refreshToken) {
    state.accessToken = null;
    return;
  }

  if (refreshPromise) {
    await refreshPromise;
    return;
  }

  refreshPromise = (async () => {
    try {
      const newTokens = await refreshAccessToken(state.apiUrl, tokens.refreshToken);
      state.accessToken = newTokens.accessToken;
      console.error("OAuth token refreshed successfully.");
    } catch {
      state.accessToken = null;
      console.error("Token refresh failed. Please re-authenticate with payvia_auth.");
    } finally {
      refreshPromise = null;
    }
  })();

  await refreshPromise;
}

// API helper
async function apiCall(
  endpoint: string,
  options: {
    method?: string;
    body?: unknown;
    useApiKey?: string;
  } = {}
): Promise<unknown> {
  const { method = "GET", body, useApiKey } = options;

  // Auto-refresh token if needed (unless using API key)
  if (!useApiKey) {
    await ensureValidToken();
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (useApiKey) {
    headers["X-API-Key"] = useApiKey;
  } else if (state.accessToken) {
    headers["Authorization"] = `Bearer ${state.accessToken}`;
  } else {
    // Auto-authenticate: start OAuth flow instead of failing
    console.error("No authentication found. Starting automatic OAuth flow...");
    const tokens = await startOAuthFlow(state.apiUrl);
    state.accessToken = tokens.accessToken;
    headers["Authorization"] = `Bearer ${state.accessToken}`;
  }

  const response = await fetch(`${state.apiUrl}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    if (response.status === 401) {
      // Token rejected by server — clear and retry with fresh auth
      state.accessToken = null;
      clearTokens();
      console.error("Token rejected. Starting re-authentication...");
      const tokens = await startOAuthFlow(state.apiUrl);
      state.accessToken = tokens.accessToken;
      headers["Authorization"] = `Bearer ${state.accessToken}`;

      const retry = await fetch(`${state.apiUrl}${endpoint}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!retry.ok) {
        const errorText = await retry.text();
        throw new Error(`API Error (${retry.status}): ${errorText}`);
      }
      const retryText = await retry.text();
      return retryText ? JSON.parse(retryText) : null;
    }
    const errorText = await response.text();
    throw new Error(`API Error (${response.status}): ${errorText}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

// Tool definitions
const tools: Tool[] = [
  // ==================== Authentication ====================
  {
    name: "payvia_auth",
    description:
      "Authenticate with PayVia via secure browser-based OAuth. Opens your default browser for login and authorization. Tokens are stored persistently for future sessions. Required before using dashboard operations.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "payvia_auth_status",
    description:
      "Check if currently authenticated with PayVia and show account info.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "payvia_logout",
    description:
      "Log out of PayVia by clearing stored authentication tokens.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "payvia_register",
    description:
      "Open the PayVia registration page in your browser. After registering, use payvia_auth to authenticate.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "payvia_get_current_user",
    description:
      "Get information about the currently authenticated user. Requires prior authentication via payvia_auth.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },

  // ==================== Project Management ====================
  {
    name: "payvia_list_projects",
    description:
      "List all projects for the authenticated user. Returns project IDs, names, and creation dates.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "payvia_create_project",
    description:
      "Create a new PayVia project. Returns the project ID and API key. The API key is shown only once - save it securely!",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: {
          type: "string",
          description: "Project name (e.g., 'My Chrome Extension')",
        },
        description: {
          type: "string",
          description: "Optional project description",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "payvia_get_project",
    description:
      "Get detailed information about a specific project including PayPal configuration status.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectId: {
          type: "string",
          description: "The project UUID",
        },
      },
      required: ["projectId"],
    },
  },
  {
    name: "payvia_update_project",
    description: "Update project name or description.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectId: {
          type: "string",
          description: "The project UUID",
        },
        name: {
          type: "string",
          description: "New project name",
        },
        description: {
          type: "string",
          description: "New project description",
        },
      },
      required: ["projectId"],
    },
  },
  {
    name: "payvia_delete_project",
    description:
      "Delete a project and all associated data. This action is irreversible!",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectId: {
          type: "string",
          description: "The project UUID to delete",
        },
      },
      required: ["projectId"],
    },
  },
  {
    name: "payvia_get_project_stats",
    description:
      "Get statistics for a project including subscriber count, revenue, and recent activity.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectId: {
          type: "string",
          description: "The project UUID",
        },
      },
      required: ["projectId"],
    },
  },

  // ==================== API Key Management ====================
  {
    name: "payvia_get_api_key",
    description:
      "Get the API key prefix for a project. Note: Full key is only shown on creation.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectId: {
          type: "string",
          description: "The project UUID",
        },
      },
      required: ["projectId"],
    },
  },
  {
    name: "payvia_regenerate_api_key",
    description:
      "Regenerate the API key for a project. The old key will stop working immediately. Returns the new full API key - save it securely!",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectId: {
          type: "string",
          description: "The project UUID",
        },
      },
      required: ["projectId"],
    },
  },

  // ==================== PayPal Configuration ====================
  {
    name: "payvia_get_paypal_config",
    description: "Get PayPal configuration status for a project.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectId: {
          type: "string",
          description: "The project UUID",
        },
      },
      required: ["projectId"],
    },
  },
  {
    name: "payvia_configure_paypal",
    description:
      "Configure PayPal credentials for a project. This creates a PayPal webhook automatically. Get credentials from https://developer.paypal.com",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectId: {
          type: "string",
          description: "The project UUID",
        },
        clientId: {
          type: "string",
          description: "PayPal Client ID from developer dashboard",
        },
        clientSecret: {
          type: "string",
          description: "PayPal Client Secret from developer dashboard",
        },
      },
      required: ["projectId", "clientId", "clientSecret"],
    },
  },

  {
    name: "payvia_configure_tranzila",
    description:
      "Configure Tranzila (Israeli payment gateway) credentials for a project. Supports separate test and live terminal names.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectId: {
          type: "string",
          description: "The project UUID",
        },
        testTerminalName: {
          type: "string",
          description: "Tranzila test/sandbox terminal name",
        },
        testPassword: {
          type: "string",
          description: "Tranzila test terminal password",
        },
        testApiKey: {
          type: "string",
          description: "Tranzila test API v2 key (optional)",
        },
        liveTerminalName: {
          type: "string",
          description: "Tranzila live terminal name",
        },
        livePassword: {
          type: "string",
          description: "Tranzila live terminal password",
        },
        liveApiKey: {
          type: "string",
          description: "Tranzila live API v2 key (optional)",
        },
        useSandbox: {
          type: "boolean",
          description: "Whether to use test terminal (default: true)",
        },
        checkoutMode: {
          type: "string",
          enum: ["Iframe", "Redirect"],
          description: "Checkout UI mode (default: Iframe)",
        },
      },
      required: ["projectId"],
    },
  },

  // ==================== Plan Management ====================
  {
    name: "payvia_list_plans",
    description:
      "List all subscription plans for a project. Returns plan details including prices and billing intervals.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectId: {
          type: "string",
          description: "The project UUID",
        },
      },
      required: ["projectId"],
    },
  },
  {
    name: "payvia_create_plan",
    description:
      "Create a new subscription plan. Interval can be 'Once' (one-time), 'Monthly', or 'Yearly'. Optionally assign to a tier and choose payment provider.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectId: {
          type: "string",
          description: "The project UUID",
        },
        name: {
          type: "string",
          description: "Plan name (e.g., 'Pro Monthly')",
        },
        description: {
          type: "string",
          description: "Plan description shown to customers",
        },
        price: {
          type: "number",
          description: "Price amount (e.g., 9.99)",
        },
        currency: {
          type: "string",
          description: "ISO 4217 currency code (e.g., 'USD', 'EUR', 'ILS')",
        },
        interval: {
          type: "string",
          enum: ["Once", "Monthly", "Yearly"],
          description: "Billing interval",
        },
        showOnPricingPage: {
          type: "boolean",
          description: "Whether to show on public pricing page (default: true)",
        },
        tierId: {
          type: "string",
          description: "Optional tier UUID to assign this plan to",
        },
        paymentProvider: {
          type: "string",
          enum: ["PayPal", "Tranzila"],
          description: "Payment provider for this plan (default: PayPal)",
        },
      },
      required: ["projectId", "name", "price", "currency", "interval"],
    },
  },
  {
    name: "payvia_get_plan",
    description: "Get detailed information about a specific plan.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectId: {
          type: "string",
          description: "The project UUID",
        },
        planId: {
          type: "string",
          description: "The plan UUID",
        },
      },
      required: ["projectId", "planId"],
    },
  },
  {
    name: "payvia_update_plan",
    description: "Update an existing plan. Note: Price changes may not affect existing subscriptions.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectId: {
          type: "string",
          description: "The project UUID",
        },
        planId: {
          type: "string",
          description: "The plan UUID",
        },
        name: {
          type: "string",
          description: "New plan name",
        },
        description: {
          type: "string",
          description: "New plan description",
        },
        price: {
          type: "number",
          description: "New price",
        },
        showOnPricingPage: {
          type: "boolean",
          description: "Whether to show on pricing page",
        },
      },
      required: ["projectId", "planId"],
    },
  },
  {
    name: "payvia_delete_plan",
    description:
      "Delete a plan. Cannot delete plans with active subscriptions.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectId: {
          type: "string",
          description: "The project UUID",
        },
        planId: {
          type: "string",
          description: "The plan UUID",
        },
      },
      required: ["projectId", "planId"],
    },
  },
  {
    name: "payvia_sync_plan_to_paypal",
    description:
      "Sync a plan to PayPal. Creates PayPal Product and Plan. Required before accepting payments for this plan.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectId: {
          type: "string",
          description: "The project UUID",
        },
        planId: {
          type: "string",
          description: "The plan UUID",
        },
      },
      required: ["projectId", "planId"],
    },
  },

  // ==================== Tier Management ====================
  {
    name: "payvia_list_tiers",
    description:
      "List all tiers for a project. Tiers are feature-based levels (Free, Pro, Super) that group plans.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectId: {
          type: "string",
          description: "The project UUID",
        },
      },
      required: ["projectId"],
    },
  },
  {
    name: "payvia_create_tier",
    description:
      "Create a new tier. Tiers define feature sets. Level determines ordering (0=Free, 1=Pro, 2=Super).",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectId: {
          type: "string",
          description: "The project UUID",
        },
        name: {
          type: "string",
          description: "Tier name (e.g., 'Pro')",
        },
        description: {
          type: "string",
          description: "Tier description",
        },
        level: {
          type: "number",
          description: "Numeric level for ordering (0=Free, 1=Pro, 2=Super)",
        },
        features: {
          type: "array",
          items: { type: "string" },
          description: "List of feature identifiers (e.g., ['api_access', 'priority_support'])",
        },
        isFree: {
          type: "boolean",
          description: "Whether this is a free tier (no payment needed)",
        },
      },
      required: ["projectId", "name", "level"],
    },
  },
  {
    name: "payvia_update_tier",
    description: "Update an existing tier's name, description, features, or level.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectId: {
          type: "string",
          description: "The project UUID",
        },
        tierId: {
          type: "string",
          description: "The tier UUID",
        },
        name: {
          type: "string",
          description: "New tier name",
        },
        description: {
          type: "string",
          description: "New tier description",
        },
        level: {
          type: "number",
          description: "New level",
        },
        features: {
          type: "array",
          items: { type: "string" },
          description: "New feature list",
        },
        isFree: {
          type: "boolean",
          description: "Whether this is a free tier",
        },
        isActive: {
          type: "boolean",
          description: "Whether the tier is active",
        },
      },
      required: ["projectId", "tierId"],
    },
  },
  {
    name: "payvia_delete_tier",
    description:
      "Delete a tier. If the tier has plans, it will be deactivated instead of deleted.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectId: {
          type: "string",
          description: "The project UUID",
        },
        tierId: {
          type: "string",
          description: "The tier UUID",
        },
      },
      required: ["projectId", "tierId"],
    },
  },
  {
    name: "payvia_assign_plan_to_tier",
    description: "Assign a plan to a tier. Plans are pricing options within a tier.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectId: {
          type: "string",
          description: "The project UUID",
        },
        tierId: {
          type: "string",
          description: "The tier UUID",
        },
        planId: {
          type: "string",
          description: "The plan UUID to assign",
        },
      },
      required: ["projectId", "tierId", "planId"],
    },
  },
  {
    name: "payvia_remove_plan_from_tier",
    description: "Remove a plan from its tier (makes it a standalone plan).",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectId: {
          type: "string",
          description: "The project UUID",
        },
        tierId: {
          type: "string",
          description: "The tier UUID",
        },
        planId: {
          type: "string",
          description: "The plan UUID to remove",
        },
      },
      required: ["projectId", "tierId", "planId"],
    },
  },

  // ==================== Subscriber Management ====================
  {
    name: "payvia_list_subscribers",
    description:
      "List all subscribers for a project. Returns customer emails, plans, status, and payment history.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectId: {
          type: "string",
          description: "The project UUID",
        },
      },
      required: ["projectId"],
    },
  },
  {
    name: "payvia_add_subscriber",
    description:
      "Manually add a subscriber (e.g., for beta testers or migrations). Creates customer with active subscription.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectId: {
          type: "string",
          description: "The project UUID",
        },
        email: {
          type: "string",
          description: "Subscriber email address",
        },
        planId: {
          type: "string",
          description: "Plan UUID to subscribe to",
        },
        status: {
          type: "string",
          enum: ["Active", "Pending", "Suspended", "Canceled", "Expired"],
          description: "Initial subscription status (default: Active)",
        },
      },
      required: ["projectId", "email", "planId"],
    },
  },
  {
    name: "payvia_update_subscriber",
    description: "Update a subscriber's status (e.g., suspend, cancel, reactivate).",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectId: {
          type: "string",
          description: "The project UUID",
        },
        subscriptionId: {
          type: "string",
          description: "The subscription UUID",
        },
        status: {
          type: "string",
          enum: ["Active", "Suspended", "Canceled", "Expired"],
          description: "New subscription status",
        },
      },
      required: ["projectId", "subscriptionId", "status"],
    },
  },
  {
    name: "payvia_delete_subscriber",
    description:
      "Delete a subscriber and their subscription data. This action is irreversible!",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectId: {
          type: "string",
          description: "The project UUID",
        },
        subscriptionId: {
          type: "string",
          description: "The subscription UUID",
        },
      },
      required: ["projectId", "subscriptionId"],
    },
  },

  {
    name: "payvia_search_subscriber",
    description:
      "Search for a specific subscriber by email. Returns all subscriptions, payments, and status details for the matching customer(s). Useful for investigating individual subscriber issues.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectId: {
          type: "string",
          description: "The project UUID",
        },
        email: {
          type: "string",
          description: "Email to search for (partial match supported)",
        },
      },
      required: ["projectId", "email"],
    },
  },

  // ==================== Audit Logs ====================
  {
    name: "payvia_get_audit_logs",
    description:
      "Get extension audit logs for a project. Shows license checks, trial starts, feature gates, upgrade clicks, and more. Supports filtering by date range, email, customer ID, action type, and result. Returns paginated logs with statistics.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectId: {
          type: "string",
          description: "The project UUID",
        },
        page: {
          type: "number",
          description: "Page number (default: 1)",
        },
        pageSize: {
          type: "number",
          description: "Results per page (default: 50, max recommended: 100)",
        },
        email: {
          type: "string",
          description: "Filter by customer email (partial match)",
        },
        customerId: {
          type: "string",
          description: "Filter by customer ID (partial match)",
        },
        action: {
          type: "string",
          enum: [
            "LICENSE_CHECK",
            "LICENSE_RESET",
            "LICENSE_CANCEL",
            "FEATURE_GATE",
            "UPGRADE_CLICK",
            "CHECKOUT_START",
            "EXTENSION_INSTALL",
            "TRIAL_START",
            "TRIAL_EXTEND",
            "TRIAL_EXPIRE",
          ],
          description: "Filter by action type",
        },
        result: {
          type: "string",
          enum: [
            "ACTIVE",
            "INACTIVE",
            "RESET",
            "CANCELED",
            "ERROR",
            "SUCCESS",
            "EXTENDED",
            "EXPIRED",
            "LOCKED",
          ],
          description: "Filter by result",
        },
        from: {
          type: "string",
          description: "Start date filter (inclusive), ISO format e.g. '2026-03-01'",
        },
        to: {
          type: "string",
          description: "End date filter (inclusive), ISO format e.g. '2026-03-21'",
        },
      },
      required: ["projectId"],
    },
  },

  // ==================== Admin ====================
  {
    name: "payvia_admin_query",
    description:
      "Execute a read-only SQL query against the PayVia database. Admin access required. Only SELECT queries allowed. Returns up to 1000 rows. Useful for investigating data issues.",
    inputSchema: {
      type: "object" as const,
      properties: {
        sql: {
          type: "string",
          description: "SQL SELECT query to execute (e.g., \"SELECT * FROM subscriptions WHERE status = 'Canceled' LIMIT 10\")",
        },
      },
      required: ["sql"],
    },
  },

  // ==================== License Validation ====================
  {
    name: "payvia_validate_license",
    description:
      "Check if a user has an active subscription. Use this to verify premium access. Requires API key.",
    inputSchema: {
      type: "object" as const,
      properties: {
        apiKey: {
          type: "string",
          description: "Project API key (X-API-Key header)",
        },
        email: {
          type: "string",
          description: "Customer email to validate",
        },
        customerId: {
          type: "string",
          description: "Or customer ID (external identifier)",
        },
      },
      required: ["apiKey"],
    },
  },
  {
    name: "payvia_get_subscription_status",
    description:
      "Get detailed subscription status for a customer. Returns plan, status, and billing period.",
    inputSchema: {
      type: "object" as const,
      properties: {
        apiKey: {
          type: "string",
          description: "Project API key",
        },
        customerId: {
          type: "string",
          description: "Customer ID to check",
        },
      },
      required: ["apiKey", "customerId"],
    },
  },

  // ==================== Configuration ====================
  {
    name: "payvia_set_api_url",
    description:
      "Set the PayVia API URL. Use for local development or self-hosted instances.",
    inputSchema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description:
            "API URL (e.g., 'http://localhost:5000' or 'https://api.payvia.site')",
        },
      },
      required: ["url"],
    },
  },
];

// Tool handlers
async function handleTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    // ==================== Authentication ====================
    case "payvia_auth": {
      // Check if already authenticated with valid token
      const existingTokens = loadTokens();
      if (existingTokens && !isTokenExpired(existingTokens) && existingTokens.apiUrl === state.apiUrl) {
        state.accessToken = existingTokens.accessToken;
        return { success: true, message: "Already authenticated with PayVia." };
      }

      // Try refresh first if we have a refresh token
      if (existingTokens?.refreshToken) {
        try {
          const refreshed = await refreshAccessToken(state.apiUrl, existingTokens.refreshToken);
          state.accessToken = refreshed.accessToken;
          return { success: true, message: "Re-authenticated with PayVia via token refresh." };
        } catch {
          // Refresh failed, proceed with full OAuth flow
        }
      }

      // Start browser-based OAuth flow
      const tokens = await startOAuthFlow(state.apiUrl);
      state.accessToken = tokens.accessToken;
      return {
        success: true,
        message: "Authenticated successfully via browser. Tokens stored for future sessions.",
      };
    }

    case "payvia_auth_status": {
      const tokens = loadTokens();
      if (!tokens) {
        return { authenticated: false, message: "Not authenticated. Use payvia_auth to log in." };
      }
      const expired = isTokenExpired(tokens);
      if (expired && !tokens.refreshToken) {
        return { authenticated: false, message: "Token expired. Use payvia_auth to re-authenticate." };
      }

      // Try to get user info
      try {
        if (expired) await ensureValidToken();
        const user = await apiCall("/api/v1/auth/me");
        return { authenticated: true, user, apiUrl: state.apiUrl };
      } catch {
        return { authenticated: false, message: "Token invalid. Use payvia_auth to re-authenticate." };
      }
    }

    case "payvia_logout": {
      clearTokens();
      state.accessToken = null;
      return { success: true, message: "Logged out. Stored tokens cleared." };
    }

    case "payvia_register": {
      // Open registration page in browser
      try {
        const { default: open } = await import("open");
        const dashboardUrl = state.apiUrl.replace("api.", "");
        await open(`${dashboardUrl}/register`);
      } catch {
        // Fallback
      }
      return {
        success: true,
        message: "Opened PayVia registration page in your browser. After registering, use payvia_auth to authenticate.",
      };
    }

    case "payvia_get_current_user": {
      return await apiCall("/api/v1/auth/me");
    }

    // ==================== Project Management ====================
    case "payvia_list_projects": {
      return await apiCall("/api/v1/dashboard/projects");
    }

    case "payvia_create_project": {
      const result = await apiCall("/api/v1/dashboard/projects", {
        method: "POST",
        body: { name: args.name, description: args.description },
      });
      return {
        ...result as object,
        warning: "IMPORTANT: Save the API key now - it won't be shown again!",
      };
    }

    case "payvia_get_project": {
      return await apiCall(`/api/v1/dashboard/projects/${args.projectId}`);
    }

    case "payvia_update_project": {
      return await apiCall(`/api/v1/dashboard/projects/${args.projectId}`, {
        method: "PUT",
        body: { name: args.name, description: args.description },
      });
    }

    case "payvia_delete_project": {
      await apiCall(`/api/v1/dashboard/projects/${args.projectId}`, {
        method: "DELETE",
      });
      return { success: true, message: "Project deleted successfully." };
    }

    case "payvia_get_project_stats": {
      return await apiCall(`/api/v1/dashboard/projects/${args.projectId}/stats`);
    }

    // ==================== API Key Management ====================
    case "payvia_get_api_key": {
      return await apiCall(`/api/v1/dashboard/projects/${args.projectId}/api-key`);
    }

    case "payvia_regenerate_api_key": {
      const result = await apiCall(
        `/api/v1/dashboard/projects/${args.projectId}/api-key/regenerate`,
        { method: "POST" }
      );
      return {
        ...result as object,
        warning: "IMPORTANT: Save the new API key now - it won't be shown again!",
      };
    }

    // ==================== PayPal Configuration ====================
    case "payvia_get_paypal_config": {
      return await apiCall(`/api/v1/dashboard/projects/${args.projectId}/paypal`);
    }

    case "payvia_configure_paypal": {
      return await apiCall(`/api/v1/dashboard/projects/${args.projectId}/paypal`, {
        method: "POST",
        body: {
          clientId: args.clientId,
          clientSecret: args.clientSecret,
        },
      });
    }

    case "payvia_configure_tranzila": {
      const body: Record<string, unknown> = {
        useSandbox: args.useSandbox ?? true,
        checkoutMode: args.checkoutMode ?? "Iframe",
      };
      if (args.testTerminalName) {
        body.testTerminalName = args.testTerminalName;
        body.testPassword = args.testPassword;
        if (args.testApiKey) body.testApiKey = args.testApiKey;
      }
      if (args.liveTerminalName) {
        body.liveTerminalName = args.liveTerminalName;
        body.livePassword = args.livePassword;
        if (args.liveApiKey) body.liveApiKey = args.liveApiKey;
      }
      return await apiCall(`/api/v1/dashboard/projects/${args.projectId}/tranzila`, {
        method: "POST",
        body,
      });
    }

    // ==================== Plan Management ====================
    case "payvia_list_plans": {
      return await apiCall(`/api/v1/dashboard/projects/${args.projectId}/plans`);
    }

    case "payvia_create_plan": {
      return await apiCall(`/api/v1/dashboard/projects/${args.projectId}/plans`, {
        method: "POST",
        body: {
          name: args.name,
          description: args.description,
          price: args.price,
          currency: args.currency,
          interval: args.interval,
          showOnPricingPage: args.showOnPricingPage ?? true,
          tierId: args.tierId,
          paymentProvider: args.paymentProvider,
        },
      });
    }

    case "payvia_get_plan": {
      return await apiCall(
        `/api/v1/dashboard/projects/${args.projectId}/plans/${args.planId}`
      );
    }

    case "payvia_update_plan": {
      return await apiCall(
        `/api/v1/dashboard/projects/${args.projectId}/plans/${args.planId}`,
        {
          method: "PUT",
          body: {
            name: args.name,
            description: args.description,
            price: args.price,
            showOnPricingPage: args.showOnPricingPage,
          },
        }
      );
    }

    case "payvia_delete_plan": {
      await apiCall(
        `/api/v1/dashboard/projects/${args.projectId}/plans/${args.planId}`,
        { method: "DELETE" }
      );
      return { success: true, message: "Plan deleted successfully." };
    }

    case "payvia_sync_plan_to_paypal": {
      return await apiCall(
        `/api/v1/dashboard/projects/${args.projectId}/plans/${args.planId}/sync-paypal`,
        { method: "POST" }
      );
    }

    // ==================== Tier Management ====================
    case "payvia_list_tiers": {
      return await apiCall(`/api/v1/dashboard/projects/${args.projectId}/tiers`);
    }

    case "payvia_create_tier": {
      return await apiCall(`/api/v1/dashboard/projects/${args.projectId}/tiers`, {
        method: "POST",
        body: {
          name: args.name,
          description: args.description,
          level: args.level,
          features: args.features ?? [],
          isFree: args.isFree ?? false,
        },
      });
    }

    case "payvia_update_tier": {
      return await apiCall(
        `/api/v1/dashboard/projects/${args.projectId}/tiers/${args.tierId}`,
        {
          method: "PUT",
          body: {
            name: args.name,
            description: args.description,
            level: args.level,
            features: args.features,
            isFree: args.isFree,
            isActive: args.isActive,
          },
        }
      );
    }

    case "payvia_delete_tier": {
      await apiCall(
        `/api/v1/dashboard/projects/${args.projectId}/tiers/${args.tierId}`,
        { method: "DELETE" }
      );
      return { success: true, message: "Tier deleted successfully." };
    }

    case "payvia_assign_plan_to_tier": {
      await apiCall(
        `/api/v1/dashboard/projects/${args.projectId}/tiers/${args.tierId}/plans/${args.planId}`,
        { method: "POST" }
      );
      return { success: true, message: "Plan assigned to tier successfully." };
    }

    case "payvia_remove_plan_from_tier": {
      await apiCall(
        `/api/v1/dashboard/projects/${args.projectId}/tiers/${args.tierId}/plans/${args.planId}`,
        { method: "DELETE" }
      );
      return { success: true, message: "Plan removed from tier successfully." };
    }

    // ==================== Subscriber Management ====================
    case "payvia_list_subscribers": {
      return await apiCall(
        `/api/v1/dashboard/projects/${args.projectId}/subscribers`
      );
    }

    case "payvia_add_subscriber": {
      return await apiCall(
        `/api/v1/dashboard/projects/${args.projectId}/subscribers`,
        {
          method: "POST",
          body: {
            email: args.email,
            planId: args.planId,
            status: args.status ?? "Active",
          },
        }
      );
    }

    case "payvia_update_subscriber": {
      return await apiCall(
        `/api/v1/dashboard/projects/${args.projectId}/subscribers/${args.subscriptionId}`,
        {
          method: "PATCH",
          body: { status: args.status },
        }
      );
    }

    case "payvia_delete_subscriber": {
      await apiCall(
        `/api/v1/dashboard/projects/${args.projectId}/subscribers/${args.subscriptionId}`,
        { method: "DELETE" }
      );
      return { success: true, message: "Subscriber deleted successfully." };
    }

    case "payvia_search_subscriber": {
      return await apiCall(
        `/api/v1/dashboard/projects/${args.projectId}/subscribers/search?email=${encodeURIComponent(args.email as string)}`
      );
    }

    // ==================== Audit Logs ====================
    case "payvia_get_audit_logs": {
      const params = new URLSearchParams();
      if (args.page) params.set("page", String(args.page));
      if (args.pageSize) params.set("pageSize", String(args.pageSize));
      if (args.email) params.set("email", args.email as string);
      if (args.customerId) params.set("customerId", args.customerId as string);
      if (args.action) params.set("action", args.action as string);
      if (args.result) params.set("result", args.result as string);
      if (args.from) params.set("from", args.from as string);
      if (args.to) params.set("to", args.to as string);
      const qs = params.toString();
      return await apiCall(
        `/api/v1/dashboard/projects/${args.projectId}/audit-logs${qs ? `?${qs}` : ""}`
      );
    }

    case "payvia_admin_query": {
      return await apiCall("/api/v1/admin/query", {
        method: "POST",
        body: { sql: args.sql },
      });
    }

    // ==================== License Validation ====================
    case "payvia_validate_license": {
      const body: Record<string, unknown> = {};
      if (args.email) body.email = args.email;
      if (args.customerId) body.customerId = args.customerId;

      return await apiCall("/api/v1/license/validate", {
        method: "POST",
        body,
        useApiKey: args.apiKey as string,
      });
    }

    case "payvia_get_subscription_status": {
      return await apiCall(
        `/api/v1/subscription/status?customerId=${encodeURIComponent(args.customerId as string)}`,
        { useApiKey: args.apiKey as string }
      );
    }

    // ==================== Configuration ====================
    case "payvia_set_api_url": {
      state.apiUrl = args.url as string;
      return {
        success: true,
        message: `API URL set to: ${state.apiUrl}`,
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Main server setup
async function main() {
  // Load persisted OAuth tokens
  initializeAuth();

  const server = new Server(
    {
      name: "payvia-mcp-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      const result = await handleTool(name, args as Record<string, unknown>);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Start server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("PayVia MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
