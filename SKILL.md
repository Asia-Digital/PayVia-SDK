---
name: payvia-integration
description: Integrate PayVia payment infrastructure into Chrome Extensions or SaaS apps. Use when a developer asks about PayVia, accepting payments, PayPal subscriptions, license validation, or feature gating.
user-invocable: true
argument-hint: "[new|existing] - whether user has an existing PayVia project"
metadata:
  display_name:
    en: PayVia Integration
    he: אינטגרציית PayVia
  display_description:
    en: Integrate PayVia payment infrastructure into Chrome Extensions or SaaS apps — PayPal subscriptions, license validation, tier-based feature gating, and trial support.
    he: שילוב תשתית תשלומים PayVia בתוספי כרום או אפליקציות SaaS — מנויי PayPal, אימות רישיון, שכבות גישה מבוססות פיצ'רים ותמיכה בתקופת ניסיון.
  tags:
    en:
      - payments
      - paypal
      - subscriptions
      - chrome-extension
      - saas
      - licensing
      - feature-gating
      - monetization
    he:
      - תשלומים
      - מנויים
      - תוספי כרום
      - רישוי
      - מונטיזציה
---

# PayVia Integration Skill

You are helping a developer integrate PayVia payment infrastructure into their Chrome Extension or SaaS application. PayVia enables accepting PayPal subscriptions with minimal code.

## Overview

PayVia provides:
- **Dashboard** - Manage projects, plans, and subscribers at https://payvia.site
- **SDK** - Client-side JavaScript library for extensions/web apps (`payvia.js`)
- **API** - RESTful API for license validation and checkout
- **MCP Server** - Tools for AI agents to manage PayVia resources

## Getting Started

Before integrating PayVia, determine the developer's starting point by asking them:

### Do you already have a PayVia project?

**If YES** (project created through the dashboard at https://payvia.site/dashboard):
1. Authenticate: `payvia_auth` (opens browser for secure OAuth login)
2. List projects: `payvia_list_projects`
3. Present the list and ask which project to use
4. Get project details: `payvia_get_project(projectId)`
5. List existing plans: `payvia_list_plans(projectId)`
6. Present plans and confirm which to use for integration
7. Get API key: `payvia_get_api_key(projectId)` (shows prefix only; if user lost the full key, use `payvia_regenerate_api_key` to create a new one - **warn the user: this invalidates the old key immediately**)
8. Skip to **SDK Integration Guide** below

**If NO** (starting from scratch):
1. Follow the **Full Setup Flow** below

### Important Notes for Existing Projects
- `payvia_get_api_key` returns only the key prefix (first 8 chars) for security. The full key was shown only at creation time.
- If PayPal is already configured and plans exist with PayPal Plan IDs, you can skip directly to SDK integration.
- Check `payvia_get_project(projectId)` to verify PayPal is configured (`payPalConfigured: true`) before attempting plan sync or checkout integration.
- If any plan lacks a PayPal Plan ID (`payPalPlanId` is null), sync it: `payvia_sync_plan_to_paypal(projectId, planId)`.

## Discovery and Selection Flow

Use this flow when a developer already has PayVia resources:

### Step 1: Authenticate
```
payvia_auth
```
Opens browser for secure OAuth login. Tokens are stored persistently for future sessions.

### Step 2: Discover Projects
```
payvia_list_projects
```

**Present to the user:** "I found these PayVia projects on your account:
1. **[Project Name]** - [X] plans, [Y] subscribers, PayPal: [configured/not configured]
2. ...

Which project would you like to integrate?"

### Step 3: Verify Project Readiness
```
payvia_get_project(projectId)
```
Check:
- `payPalConfigured` -- if false, guide user to configure PayPal credentials first
- Plan count -- if 0, guide user to create plans first

### Step 4: Discover Plans
```
payvia_list_plans(projectId)
```

**Present to the user:** "Your project has these plans:
1. **[Plan Name]** - $[Price]/[interval] (PayPal synced: [yes/no])
2. ...

Which plan(s) should I integrate into your extension?"

### Step 5: Get API Key
```
payvia_get_api_key(projectId)
```
If the user doesn't have their full API key, offer to regenerate:
```
payvia_regenerate_api_key(projectId)
```
**CRITICAL:** Tell the user to save the new API key immediately -- it will not be shown again.

### Step 6: Proceed to SDK Integration
With the project ID, plan ID(s), and API key in hand, proceed to the **SDK Integration Guide** section.

## Full Setup Flow

1. **Setup Project** (via MCP or Dashboard)
   - Authenticate: `payvia_auth`
   - Create a PayVia project: `payvia_create_project`
   - Configure PayPal credentials: `payvia_configure_paypal`
   - Create tiers: `payvia_create_tier`
   - Create subscription plans: `payvia_create_plan`
   - Sync plans to PayPal: `payvia_sync_plan_to_paypal`
   - Save your API key (shown only at project creation)

2. **Integrate SDK** (in extension/app code)
   - Add PayVia SDK to your project
   - Initialize with your API key
   - Implement feature gating based on subscription status
   - Add payment/upgrade UI

## MCP Server Tools

When the PayVia MCP Server is available, use these tools:

### Authentication
- `payvia_auth` - Authenticate via browser-based OAuth (opens browser, tokens stored persistently)
- `payvia_auth_status` - Check current authentication status and account info
- `payvia_logout` - Clear stored authentication tokens
- `payvia_register` - Open registration page in browser (for new accounts)
- `payvia_get_current_user` - Get info about the currently authenticated user

### Project Management
- `payvia_list_projects` - List all projects for the authenticated user
- `payvia_create_project` - Create new project (returns API key - save it!)
- `payvia_get_project` - Get project details including PayPal configuration status
- `payvia_update_project` - Update project name or description
- `payvia_delete_project` - Delete a project and all associated data (irreversible!)
- `payvia_get_project_stats` - Get statistics: subscriber count, revenue, recent activity

### API Key Management
- `payvia_get_api_key` - Get API key prefix (full key shown only at creation)
- `payvia_regenerate_api_key` - Generate new API key (old key stops working immediately!)

### PayPal Configuration
- `payvia_get_paypal_config` - Check PayPal configuration status for a project
- `payvia_configure_paypal` - Set PayPal credentials (creates webhook automatically)

### Tier Management
- `payvia_list_tiers` - List tiers for a project (with nested plans)
- `payvia_create_tier` - Create feature tier (Free, Pro, Super)
- `payvia_update_tier` - Update tier details, features, or level
- `payvia_delete_tier` - Delete or deactivate a tier
- `payvia_assign_plan_to_tier` - Assign a plan to a tier
- `payvia_remove_plan_from_tier` - Remove plan from tier (makes it standalone)

### Plan Management
- `payvia_list_plans` - List plans for a project (includes tierId, tierName)
- `payvia_create_plan` - Create subscription plan (optionally assign to tier)
- `payvia_get_plan` - Get detailed info about a specific plan
- `payvia_update_plan` - Update plan details (price changes may not affect existing subscriptions)
- `payvia_delete_plan` - Delete a plan (cannot delete plans with active subscriptions)
- `payvia_sync_plan_to_paypal` - Sync plan to PayPal (required before accepting payments)

### Subscriber Management
- `payvia_list_subscribers` - List all subscribers with emails, plans, status, payment history
- `payvia_add_subscriber` - Manually add a subscriber (for beta testers, migrations)
- `payvia_update_subscriber` - Update subscriber status (suspend, cancel, reactivate)
- `payvia_delete_subscriber` - Delete subscriber and subscription data (irreversible!)

### License Operations
- `payvia_validate_license` - Check if user has active subscription (requires API key)
- `payvia_get_subscription_status` - Get detailed subscription info

### Configuration
- `payvia_set_api_url` - Set API URL (for local dev or self-hosted instances)

## SDK Integration Guide

### Step 1: Add the SDK

For Chrome Extensions, add to your `manifest.json`:

```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  },
  "host_permissions": [
    "https://api.payvia.site/*",
    "https://payvia.site/*"
  ]
}
```

If using Google Identity for automatic user detection, also add:
```json
{
  "permissions": ["identity", "identity.email"]
}
```

Install the SDK:

```bash
npm install @payvia-sdk/sdk
```

Or copy `payvia.js` directly to your extension's `lib/` folder.

### Step 2: Initialize PayVia

The SDK is a **factory function** (not a class) that takes an **API key**:

```javascript
// In your background.js or popup.js
import PayVia from './lib/payvia.js';

const payvia = PayVia('YOUR_API_KEY');  // API key from dashboard or MCP tool
```

> **Note:** The API URL is hardcoded to `https://api.payvia.site` in the SDK. No need to configure it.

### Step 3: User Identity (Automatic)

The SDK automatically identifies users in this order:
1. **Google Identity** - If the extension has `identity` permission, uses the user's Google email
2. **Random ID fallback** - Generates a persistent `pv_` prefixed UUID, synced via `chrome.storage.sync`

You can check identity info:
```javascript
const identity = await payvia.getIdentity();
// { id: "user@gmail.com", email: "user@gmail.com", source: "google" }
// or: { id: "pv_abc123...", email: null, source: "random" }
```

### Step 4: Check Subscription Status

```javascript
// Check if user has premium access
async function checkPremiumAccess() {
  const user = await payvia.getUser();

  if (user.status === 'ACTIVE' || user.status === 'TRIAL') {
    // user.paid === true
    // user.tier contains tier info (id, name, level, features)
    // user.features is a shortcut to user.tier.features
    // user.isTrial / user.trialExpiresAt / user.daysRemaining for trial info
    // user.fromCache indicates if data came from cache
    return true;
  }
  return false;
}

// Tier-based access check (recommended)
async function hasPremiumTier() {
  return await payvia.hasTierLevel(1); // 0=Free, 1=Pro, 2=Super
}

// Feature-based access check
async function canExportPdf() {
  return await payvia.hasFeature('export_pdf');
}

// Get tier info directly
const tier = await payvia.getTier();
// { id: "...", name: "Pro", level: 1, features: ["export_pdf", "api_access"] }
```

### Step 5: Gate Premium Features

```javascript
// Example: Premium feature wrapper
async function usePremiumFeature() {
  const hasPremium = await checkPremiumAccess();

  if (!hasPremium) {
    showUpgradeModal();
    return;
  }

  executePremiumLogic();
}

function showUpgradeModal() {
  // Open payment page with pricing options
  payvia.openPaymentPage({ mode: 'pricing' });
}
```

### Step 6: Payment Page

The SDK supports three checkout modes:

```javascript
// Mode 1: Pricing page (recommended, most secure)
// Shows all plans, user picks. Requires email.
await payvia.openPaymentPage({ mode: 'pricing' });

// Mode 2: Hosted checkout (specific plan)
// Skips plan selection, goes to checkout. Requires email + planId.
await payvia.openPaymentPage({ mode: 'hosted', planId: 'PLAN_UUID' });

// Mode 3: Direct PayPal (bypasses PayVia UI)
// Goes straight to PayPal. Requires planId.
await payvia.openPaymentPage({
  mode: 'direct',
  planId: 'PLAN_UUID',
  successUrl: 'https://example.com/success',
  cancelUrl: 'https://example.com/cancel'
});
```

Check if email input is needed before payment:
```javascript
if (await payvia.needsEmailForPayment()) {
  // User has no Google identity - prompt for email
  const email = promptForEmail();
  await payvia.openPaymentPage({ mode: 'pricing', email });
} else {
  // Google email detected automatically
  await payvia.openPaymentPage({ mode: 'pricing' });
}
```

### Step 7: Handle Payment Completion

```javascript
// Listen for successful payments (polls every 5 seconds)
const stopListening = payvia.onPaid((user) => {
  console.log('Payment successful!', user);
  updateUIForPremium(user.planIds);
});

// Call stopListening() to stop polling when no longer needed
```

### Step 8: Trial Support

```javascript
// Start trial on first use (idempotent - safe to call multiple times)
if (await payvia.isFirstRun()) {
  const trial = await payvia.startTrial();
  if (trial) {
    console.log(`Trial started! ${trial.daysRemaining} days remaining`);
    // trial: { subscriptionId, status, planId, planName, trialExpiresAt, daysRemaining }
  }
  await payvia.markFirstRunDone();
}

// Check trial status
const trialStatus = await payvia.getTrialStatus();
// { status, trialExpiresAt, daysRemaining, canConvert, planIds }
```

## SDK Method Reference

| Method | Description |
|--------|-------------|
| `getUser(options?)` | Get user's payment status. Options: `{ forceRefresh: boolean }` |
| `refresh()` | Force refresh user status from server |
| `refreshLicenseCache()` | Refresh cache if expired (for background service worker) |
| `hasFeature(name)` | Check if user has a specific feature |
| `hasTierLevel(level)` | Check if user's tier is at or above level |
| `getTier()` | Get user's current tier info |
| `getIdentity()` | Get user identity (id, email, source) |
| `needsEmailForPayment()` | Check if email prompt is needed (no Google identity) |
| `openPaymentPage(options)` | Open checkout (modes: pricing, hosted, direct) |
| `onPaid(callback)` | Listen for payment status changes (returns cleanup fn) |
| `getPlans()` | Get available plans for this project |
| `startTrial()` | Start trial for current user (idempotent) |
| `getTrialStatus()` | Get trial status for current user |
| `isFirstRun()` | Check if extension is being used for the first time |
| `markFirstRunDone()` | Mark first run as complete |
| `cancelSubscription(options?)` | Cancel subscription. Options: `{ planId?, reason? }` |
| `resetLicense()` | Reset user's license (demo/testing only) |

## Plan Configuration

When creating plans, consider:

### Billing Intervals
- `Once` - One-time purchase (lifetime access)
- `Monthly` - Recurring monthly subscription
- `Yearly` - Recurring annual subscription

### Example Plan Structure

```javascript
// Using MCP tool: payvia_create_plan
{
  name: "Pro Monthly",
  description: "Full access to all premium features",
  price: 9.99,
  currency: "USD",
  interval: "Monthly",
  showOnPricingPage: true,
  tierId: "TIER_UUID"  // optional - assign to tier
}
```

### Recommended Tier-Based Setup

**Tiers** define feature sets, **Plans** are pricing options within tiers:

1. **Free Tier** (Level 0)
   - `isFree: true`, no plans needed
   - Features: `["basic_search", "5_configs"]`

2. **Pro Tier** (Level 1)
   - Features: `["unlimited_search", "unlimited_configs", "export_pdf"]`
   - Plans: Pro Monthly ($9.99/mo), Pro Yearly ($99/yr)

3. **Super Tier** (Level 2)
   - Features: `["everything_in_pro", "api_access", "priority_support"]`
   - Plans: Super Monthly ($19.99/mo), Super Yearly ($199/yr)

## License Caching

The SDK caches license validation results for offline resilience:

```javascript
// Cache structure (stored in chrome.storage.local)
{
  status: "ACTIVE",
  tier: { id: "...", name: "Pro", level: 1, features: [...] },
  planIds: ["..."],
  isTrial: false,
  trialExpiresAt: null,
  daysRemaining: null,
  checkedAt: 1709042400000,  // Unix timestamp ms
  ttl: 604800000,            // 7 days (server-controlled)
  signature: "base64-hmac"   // Anti-tamper signature
}
```

### Cache Behavior

- **In-memory cache**: Returned instantly on repeated `getUser()` calls
- **Persistent cache (valid)**: Used when within TTL (no network call)
- **Persistent cache (expired)**: Refresh from server, fall back to cache on error
- **30-day grace period**: Allow cached access during prolonged network outages
- **Background refresh**: `payvia.refreshLicenseCache()` on extension startup

```javascript
// Setup background refresh in service worker
chrome.runtime.onStartup.addListener(async () => {
  await payvia.refreshLicenseCache();
});
```

## API Key Usage

The API key authenticates the SDK with the PayVia server. It is sent as `X-API-Key` header on every request.

```javascript
// Direct API call example (the SDK does this internally)
const response = await fetch('https://api.payvia.site/api/v1/license/validate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'YOUR_API_KEY'
  },
  body: JSON.stringify({
    email: userEmail,       // or customerId
    customerId: 'pv_...'
  })
});

const result = await response.json();
// { status, planIds, tier, isTrial, trialExpiresAt, daysRemaining,
//   checkedAt, ttl, signature }
```

## Complete Integration Example

Here's a full example for a Chrome Extension popup:

```javascript
// popup.js
import PayVia from './lib/payvia.js';

const payvia = PayVia('YOUR_API_KEY');

document.addEventListener('DOMContentLoaded', async () => {
  // Start trial on first run
  if (await payvia.isFirstRun()) {
    await payvia.startTrial();
    await payvia.markFirstRunDone();
  }

  const user = await payvia.getUser();

  if (user.paid) {
    showPremiumUI(user);
  } else {
    showFreeUI();
  }
});

function showPremiumUI(user) {
  document.getElementById('premium-features').style.display = 'block';
  document.getElementById('upgrade-banner').style.display = 'none';

  if (user.isTrial) {
    document.getElementById('trial-badge').textContent =
      `Trial: ${user.daysRemaining} days left`;
  }
}

function showFreeUI() {
  document.getElementById('premium-features').style.display = 'none';
  document.getElementById('upgrade-banner').style.display = 'block';

  document.getElementById('upgrade-btn').addEventListener('click', async () => {
    if (await payvia.needsEmailForPayment()) {
      const email = prompt('Enter your email to continue:');
      if (email) payvia.openPaymentPage({ mode: 'pricing', email });
    } else {
      payvia.openPaymentPage({ mode: 'pricing' });
    }
  });
}

// Handle successful payment
const stopListening = payvia.onPaid((user) => {
  showPremiumUI(user);
  showSuccessNotification('Welcome to Premium!');
});
```

## Best Practices

### Security
- The API key is sent via `X-API-Key` header (not exposed in URLs)
- The SDK uses `chrome.storage.sync` to persist user IDs across devices
- License cache includes HMAC signature for anti-tamper verification
- For web apps, validate licenses server-side

### User Experience
- Use `isFirstRun()` + `startTrial()` for automatic trial onboarding
- Use `needsEmailForPayment()` to conditionally prompt for email
- Cache subscription status to avoid repeated API calls (SDK does this automatically)
- Show loading states during payment verification
- Provide clear upgrade paths and pricing
- Handle payment failures gracefully

### Feature Gating Patterns

```javascript
// Pattern 1: Tier level check (recommended)
const hasPro = await payvia.hasTierLevel(1);     // Pro or above
const hasSuper = await payvia.hasTierLevel(2);   // Super only

// Pattern 2: Feature-based check (most flexible)
const canExport = await payvia.hasFeature('export_pdf');
const hasApi = await payvia.hasFeature('api_access');

// Pattern 3: Direct tier access
const user = await payvia.getUser();
const tierLevel = user.tier?.level || 0;
const features = user.features || [];

// Pattern 4: Combined check (offline-aware)
const user = await payvia.getUser();
if (user.fromCache && user.status === 'ACTIVE') {
  // Using cached data - still works offline
}
```

## Troubleshooting

### Common Issues

1. **"Invalid API Key"**
   - Verify the API key is correct
   - Check if the key was regenerated
   - Ensure X-API-Key header is set correctly

2. **"Project not found"**
   - Verify projectId matches your dashboard
   - Check if project was deleted

3. **Subscription shows INACTIVE after payment**
   - PayPal webhook may be delayed (wait 30s)
   - Check PayPal webhook configuration
   - Call `payvia.refresh()` to force update

4. **CORS errors**
   - Ensure `host_permissions` includes `https://api.payvia.site/*` and `https://payvia.site/*`
   - For web apps, check your domain is allowed

5. **Email required for payment**
   - Use `payvia.needsEmailForPayment()` to check
   - If user has no Google identity, prompt for email before calling `openPaymentPage`

## MCP Workflow Examples

### Example 1: New Project Setup

```
1. payvia_auth
   → Opens browser, user logs in and authorizes, token stored automatically

2. payvia_create_project(name: "My Chrome Extension")
   → Returns { projectId, apiKey }
   → SAVE THE API KEY!

3. payvia_configure_paypal(projectId, clientId, clientSecret)
   → Configures PayPal and creates webhook

4. payvia_create_tier(projectId, {
     name: "Free",
     level: 0,
     features: ["basic_search", "5_configs"],
     isFree: true
   })
   → Creates free tier

5. payvia_create_tier(projectId, {
     name: "Pro",
     level: 1,
     features: ["unlimited_search", "unlimited_configs", "export_pdf"]
   })
   → Returns { tierId }

6. payvia_create_plan(projectId, {
     name: "Pro Monthly",
     price: 9.99,
     currency: "USD",
     interval: "Monthly",
     tierId: tierId
   })
   → Returns plan details

7. payvia_sync_plan_to_paypal(projectId, planId)
   → Creates PayPal product and plan

Now the extension is ready to accept payments with tier-based feature gating!
```

### Example 2: Existing Project Integration

```
1. payvia_auth
   → Opens browser (or uses stored token from previous session)

2. payvia_list_projects
   → Shows: "Cool Extension" (id: abc-123), 2 plans, PayPal: configured
   → User selects "Cool Extension"

3. payvia_get_project(projectId: "abc-123")
   → Verify payPalConfigured: true

4. payvia_list_tiers(projectId: "abc-123")
   → Shows: Free (level 0), Pro (level 1)

5. payvia_list_plans(projectId: "abc-123")
   → Shows: "Pro Monthly" ($9.99/mo, PayPal synced), "Pro Yearly" ($99/yr, PayPal synced)
   → User confirms both plans

6. payvia_get_api_key(projectId: "abc-123")
   → Shows: "pv_Hk8x..." (prefix only)
   → User confirms they have the full key saved

Now integrate the SDK into the extension code using the API key.
```

### Example 3: Check Project Health

```
1. payvia_auth_status
   → Verify authenticated

2. payvia_get_project_stats(projectId)
   → Shows subscriber count, revenue, recent activity

3. payvia_list_subscribers(projectId)
   → Review subscriber list and statuses

4. payvia_list_tiers(projectId)
   → Verify tier structure and features
```

## Resources

- **Dashboard**: https://payvia.site
- **API Base URL**: https://api.payvia.site
- **Sample Extension**: See `sample-extension/` in this repo
- **Sample SaaS App**: See `sample-saas/` in this repo
