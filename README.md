# PayVia SDK

A lightweight JavaScript SDK for connecting your Chrome Extension / SaaS app to PayVia, for accepting PayPal payments and managing subscriptions, license validation, tier-based feature gating, trial management and monthly / yearly / lifetime plans.

## Quick Start

The `sample-extension` comes pre-configured with a shared demo project and works out of the box:

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `sample-extension` folder
4. Click the extension icon — everything works!

> **Note:** The demo project is shared across all users and is meant for testing only.
> To accept real payments, create your own project at [PayVia Dashboard](https://payvia.site/dashboard).

## Installation

### Option 1: Copy directly

Copy `payvia.js` into your extension folder.

### Option 2: npm

```bash
npm install @payvia-sdk/sdk
```

## TypeScript Support

The SDK ships with built-in TypeScript declarations - no `@types/*` package needed:

```typescript
import PayVia from '@payvia-sdk/sdk';
import type { PayViaUser, Tier } from '@payvia-sdk/sdk';

const payvia = PayVia(process.env.PAYVIA_API_KEY!);

const user: PayViaUser = await payvia.getUser();
if (user.tier && user.tier.level >= 1) {
  // Pro or above
}
```

All methods, options, and return types have full IntelliSense support.

## Basic Usage

### 1. Add to manifest.json

```json
{
  "manifest_version": 3,
  "name": "Your Extension",
  "permissions": ["storage"],
  "host_permissions": [
    "https://api.payvia.site/*",
    "https://payvia.site/*"
  ],
  "background": {
    "service_worker": "background.js"
  }
}
```

If using Google Identity for automatic user detection, also add:
```json
{
  "permissions": ["storage", "identity", "identity.email"]
}
```

### 2. Initialize in background.js

```javascript
import PayVia from './payvia.js';

const payvia = PayVia('YOUR_API_KEY');

// Check if user has paid
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkPaid') {
    payvia.getUser().then(user => {
      sendResponse({ paid: user.paid });
    });
    return true; // async response
  }
});
```

### 3. Check payment status

```javascript
const user = await payvia.getUser();

if (user.paid) {
  enablePremiumFeatures();
} else {
  showUpgradeButton();
}
```

### 4. Open payment page

```javascript
// Option 1: Pricing page — shows all plans (recommended)
await payvia.openPaymentPage({ mode: 'pricing', email: userEmail });

// Option 2: Hosted checkout — specific plan
await payvia.openPaymentPage({ mode: 'hosted', planId: 'your-plan-id', email: userEmail });

// Option 3: Direct PayPal — no PayVia UI
await payvia.openPaymentPage({ mode: 'direct', planId: 'your-plan-id', email: userEmail });
```

### 5. Listen for payment changes

```javascript
const unsubscribe = payvia.onPaid((user) => {
  console.log('User just paid!', user);
  enablePremiumFeatures();
});

// Call unsubscribe() to stop listening
```

---

## Checkout Modes

| Mode | Description | When to use |
|------|-------------|-------------|
| `pricing` | PayVia plan selection page | **Default** — when you have multiple plans |
| `hosted` | PayVia checkout for a specific plan | When you have one plan or want to skip selection |
| `direct` | Straight to PayPal, no PayVia UI | For developers who want full UI control |

---

## User Identity

The SDK automatically identifies users:

1. **Google Identity** — if the extension has the `identity` permission, uses the user's Google email
2. **Random ID fallback** — generates a persistent `pv_`-prefixed UUID, synced via `chrome.storage.sync`

```javascript
const identity = await payvia.getIdentity();
// { id: "user@gmail.com", email: "user@gmail.com", source: "google" }
// or: { id: "pv_abc123...", email: null, source: "random" }
```

---

## Tier-Based Feature Gating

Tiers define feature sets (Free/Pro/Super). Plans are pricing options within tiers.

```javascript
// Check tier level (0=Free, 1=Pro, 2=Super)
const hasPro = await payvia.hasTierLevel(1); // Pro or above

// Check specific feature
const canExport = await payvia.hasFeature('export_pdf');

// Get full tier info
const tier = await payvia.getTier();
// { id: "...", name: "Pro", level: 1, features: ["export_pdf", "api_access"] }

// Or via user object
const user = await payvia.getUser();
// user.tier — tier object
// user.features — shortcut to user.tier.features
```

---

## Trial Support

```javascript
// Start trial on first use (idempotent — safe to call multiple times)
if (await payvia.isFirstRun()) {
  const trial = await payvia.startTrial();
  if (trial) {
    console.log(`Trial started! ${trial.daysRemaining} days remaining`);
    // { subscriptionId, status, planId, planName, trialExpiresAt, daysRemaining }
  }
  await payvia.markFirstRunDone();
}

// Check trial status
const status = await payvia.getTrialStatus();
// { status, trialExpiresAt, daysRemaining, canConvert, planIds }
```

Trial info is also available on the user object:

```javascript
const user = await payvia.getUser();
// user.isTrial — boolean
// user.trialExpiresAt — Date or null
// user.daysRemaining — number or null
```

---

## License Caching

The SDK caches license data for offline resilience. No setup required — it works automatically.

- **TTL**: 7 days (server-controlled)
- **Grace period**: 30 days (allows offline access after TTL expires)
- **Storage**: `chrome.storage.local` (extension) or `localStorage` (web)
- **Anti-tamper**: HMAC-SHA256 signature verification

```javascript
// Refresh cache in background (e.g., service worker startup)
chrome.runtime.onStartup.addListener(async () => {
  await payvia.refreshLicenseCache();
});

// Check if data came from cache
const user = await payvia.getUser();
if (user.fromCache) {
  // Using cached data — works offline
}
```

---

## API Reference

### `PayVia(apiKey)`

Creates a new PayVia instance.

| Parameter | Type | Description |
|-----------|------|-------------|
| `apiKey` | string | API key from the PayVia dashboard |

---

### `payvia.getUser(options?)`

Returns the user's payment status and subscription info. Uses cache automatically.

**Options:** `{ forceRefresh: boolean }`

**Returns:** `Promise<PayViaUser>`

```typescript
interface PayViaUser {
  id: string;                          // Unique user identifier
  email: string | null;                // User email (if available)
  identitySource: 'google' | 'random'; // Identity source
  paid: boolean;                       // true if ACTIVE or TRIAL
  status: 'ACTIVE' | 'TRIAL' | 'INACTIVE'; // Subscription status
  tier: {                              // Current tier (or null)
    id: string;
    name: string;
    level: number;                     // 0=Free, 1=Pro, 2=Super
    features: string[];
  } | null;
  features: string[];                  // Shortcut to tier.features
  planIds: string[];                   // Purchased plan IDs
  isTrial: boolean;                    // Whether on trial
  trialExpiresAt: Date | null;         // Trial expiration date
  daysRemaining: number | null;        // Trial days remaining
  fromCache: boolean;                  // true if data came from cache
  checkedAt: number | null;            // Unix timestamp (ms)
  ttl: number | null;                  // Cache TTL in ms
  signature: string | null;            // HMAC anti-tamper signature
}
```

---

### `payvia.refresh()`

Force-refreshes user status from the server (bypasses cache).

**Returns:** `Promise<PayViaUser>`

---

### `payvia.refreshLicenseCache()`

Refreshes the license cache if expired. Ideal for background service worker startup.

**Returns:** `Promise<void>`

---

### `payvia.openPaymentPage(options)`

Opens the payment page in a new tab.

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `mode` | `'pricing' \| 'hosted' \| 'direct'` | No | Checkout mode (default: `pricing`) |
| `planId` | string | For hosted/direct | Plan ID to purchase |
| `email` | string | No | Customer email |
| `successUrl` | string | For direct | Redirect URL after successful payment |
| `cancelUrl` | string | For direct | Redirect URL if user cancels |

**Returns:** `Promise<{ mode, pricingUrl? | checkoutUrl? }>`

---

### `payvia.onPaid(callback)`

Listens for payment status changes (polls every 5 seconds).

**Returns:** `Function` — call it to stop listening

---

### `payvia.hasFeature(name)`

Checks if the user's tier includes a specific feature.

**Returns:** `Promise<boolean>`

---

### `payvia.hasTierLevel(level)`

Checks if the user's tier is at or above the required level.

**Returns:** `Promise<boolean>`

---

### `payvia.getTier()`

Returns the user's current tier info.

**Returns:** `Promise<{ id, name, level, features } | null>`

---

### `payvia.getIdentity()`

Returns the current user identity.

**Returns:** `Promise<{ id: string, email: string | null, source: 'google' | 'random' }>`

---

### `payvia.needsEmailForPayment()`

Checks if an email prompt is needed (user has no Google identity).

**Returns:** `Promise<boolean>`

---

### `payvia.getPlans()`

Returns available plans for the project.

**Returns:** `Promise<Plan[]>`

---

### `payvia.startTrial()`

Starts a trial for the current user. Idempotent — safe to call multiple times.

**Returns:** `Promise<{ subscriptionId, status, planId, planName, trialExpiresAt, daysRemaining } | null>`

---

### `payvia.getTrialStatus()`

Returns the trial status for the current user.

**Returns:** `Promise<{ status, trialExpiresAt, daysRemaining, canConvert, planIds }>`

---

### `payvia.isFirstRun()`

Checks if the extension is being used for the first time.

**Returns:** `Promise<boolean>`

---

### `payvia.markFirstRunDone()`

Marks the first run as complete.

---

### `payvia.cancelSubscription(options?)`

Cancels the user's subscription.

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `planId` | string | No | Specific plan to cancel |
| `reason` | string | No | Cancellation reason |

**Returns:** `Promise<{ success, message, canceledPlanId }>`

---

### `payvia.resetLicense()`

Resets the user's license (for testing/demo purposes). Deletes all subscriptions for the current user.

**Returns:** `Promise<{ message }>`

---

## Plan Description Format

In the PayVia Dashboard, you can write plan descriptions with feature lists:

```
Everything in Free, plus:
+++Unlimited access
+++Priority support
+++Custom features
Contact us for enterprise plans
```

Lines starting with `+++` are displayed with a green checkmark on checkout pages.

---

## Sample Extension

See the `sample-extension/` folder for a working example that demonstrates:

1. **Payment status check** — automatic user detection
2. **Three checkout modes** — Pricing Page, Hosted Checkout, Direct PayPal
3. **Feature-per-Plan** — each plan unlocks different features
4. **Smart identity** — Google Identity and Random ID support
5. **Reset demo** — button to reset license for repeated testing

### Running the sample:

1. Open `chrome://extensions/`
2. Enable Developer mode
3. Click "Load unpacked"
4. Select the `sdk/sample-extension/` folder
5. Click the extension icon

---

## FAQ

### How is the user identified?

PayVia uses `chrome.storage.sync` to create a unique ID that persists even if the user uninstalls the extension. If the user is signed into Chrome and you have the `identity` permission, identification uses their Google email instead.

### What happens offline?

The SDK uses cached license data with a 7-day TTL and 30-day grace period. During network outages within the grace period, the cached status is returned. If no valid cache exists, `getUser()` returns `{ paid: false, status: 'INACTIVE' }`.

### What's the difference between checkout modes?

- **pricing** — user sees all plans and picks one
- **hosted** — user sees a styled checkout page for a specific plan
- **direct** — user is sent straight to PayPal with no PayVia UI

### How do I test in development?

Use PayPal Sandbox credentials and PayPal Sandbox accounts.

---

## Resources

- **Dashboard**: https://payvia.site
- **API Base URL**: https://api.payvia.site
- **Sample Extension**: `sample-extension/` in this repo
- **Sample SaaS App**: `sample-saas/` in this repo
- **MCP Server** (for AI agents): See [`mcp-server/`](mcp-server/) in this repo
- **AI Agent Skill**: See [`skill.md`](skill.md) in this repo
