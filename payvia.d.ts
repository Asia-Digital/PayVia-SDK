export default PayVia;
export type Tier = {
    id: string;
    name: string;
    /**
     * - 0=Free, 1=Pro, 2=Super
     */
    level: number;
    features: string[];
};
export type Identity = {
    /**
     * - Unique user identifier (email or random pv_* ID)
     */
    id: string;
    /**
     * - User email (if known)
     */
    email: string | null;
    /**
     * - How the identity was obtained
     */
    source: "google" | "random";
};
export type PayViaUser = {
    id: string;
    email: string | null;
    identitySource: "google" | "random";
    /**
     * - True if status is ACTIVE or TRIAL
     */
    paid: boolean;
    status: "ACTIVE" | "TRIAL" | "INACTIVE";
    tier: Tier | null;
    /**
     * - Shortcut to tier.features
     */
    features: string[];
    planIds: string[];
    isTrial: boolean;
    trialExpiresAt?: Date | null;
    daysRemaining?: number | null;
    canceledAt?: Date | null;
    currentPeriodEnd?: Date | null;
    isCanceled?: boolean;
    cancelGraceActive?: boolean;
    /**
     * - True if data came from cache
     */
    fromCache: boolean;
    /**
     * - Unix timestamp in ms
     */
    checkedAt?: number | null;
    /**
     * - Cache TTL in ms
     */
    ttl?: number | null;
    /**
     * - HMAC anti-tamper signature
     */
    signature?: string | null;
    /**
     * - Set only when a network error occurred and no valid cache existed
     */
    error?: string;
};
export type TrialStartResult = {
    subscriptionId: string;
    status: string;
    planId: string;
    planName: string;
    trialExpiresAt: Date;
    daysRemaining: number;
};
export type TrialStatus = {
    status: string;
    trialExpiresAt: Date | null;
    daysRemaining: number | null;
    canConvert: boolean;
    planIds: string[];
};
export type Plan = {
    id: string;
    name: string;
    description?: string;
    price?: number;
    currency?: string;
    interval?: string;
    tierId?: string;
};
export type OpenPaymentPageOptions = {
    /**
     * - Checkout mode (default: 'pricing')
     */
    mode?: "pricing" | "hosted" | "direct";
    /**
     * - Required for 'hosted' and 'direct' modes
     */
    planId?: string;
    /**
     * - Customer email (optional; PayPal collects it for anonymous users)
     */
    email?: string;
    /**
     * - Redirect URL after successful payment ('direct' mode only)
     */
    successUrl?: string;
    /**
     * - Redirect URL if user cancels ('direct' mode only)
     */
    cancelUrl?: string;
};
export type OpenPaymentPageResult = {
    /**
     * - 'pricing' | 'hosted' for those modes; null/'iframe'/'redirect' for 'direct' mode (reflects PayVia backend response shape)
     */
    mode?: string | null;
    pricingUrl?: string;
    checkoutUrl?: string;
    sessionId?: string;
    /**
     * - 'PayPal' | 'Tranzila'
     */
    provider?: string;
};
export type CancelSubscriptionOptions = {
    /**
     * - Specific plan to cancel
     */
    planId?: string;
    /**
     * - Cancellation reason
     */
    reason?: string;
};
export type CancelSubscriptionResult = {
    success: boolean;
    message: string;
    canceledPlanId?: string;
};
export type ResetLicenseResult = {
    message: string;
};
export type OnPaidCallback = (user: PayViaUser) => void;
export type PayViaInstance = {
    getUser: (options?: {
        forceRefresh?: boolean;
    }) => Promise<PayViaUser>;
    refresh: () => Promise<PayViaUser>;
    refreshLicenseCache: () => Promise<void>;
    hasFeature: (featureName: string) => Promise<boolean>;
    hasTierLevel: (requiredLevel: number) => Promise<boolean>;
    getTier: () => Promise<Tier | null>;
    startTrial: () => Promise<TrialStartResult | null>;
    getTrialStatus: () => Promise<TrialStatus>;
    isFirstRun: () => Promise<boolean>;
    markFirstRunDone: () => Promise<void>;
    needsEmailForPayment: () => Promise<boolean>;
    getIdentity: () => Promise<Identity>;
    openPaymentPage: (options?: OpenPaymentPageOptions) => Promise<OpenPaymentPageResult>;
    onPaid: (callback: OnPaidCallback) => (() => void);
    getPlans: () => Promise<Plan[]>;
    resetLicense: () => Promise<ResetLicenseResult>;
    cancelSubscription: (options?: CancelSubscriptionOptions) => Promise<CancelSubscriptionResult>;
};
/**
 * PayVia SDK for Chrome Extensions
 *
 * ספריית JavaScript שהסולק מטמיע בתוסף הכרום שלו
 * מאפשרת בדיקת רישיון, פתיחת חלון תשלום, וניהול מנויים
 *
 * Usage:
 * ```javascript
 * import PayVia from './payvia.js';
 *
 * const payvia = PayVia('YOUR_API_KEY');
 *
 * // Check if user paid
 * const user = await payvia.getUser();
 * if (user.paid) {
 *   // Enable premium features
 * }
 *
 * // Open payment page
 * payvia.openPaymentPage();
 * ```
 */
/**
 * @typedef {Object} Tier
 * @property {string} id
 * @property {string} name
 * @property {number} level - 0=Free, 1=Pro, 2=Super
 * @property {string[]} features
 */
/**
 * @typedef {Object} Identity
 * @property {string} id - Unique user identifier (email or random pv_* ID)
 * @property {string | null} email - User email (if known)
 * @property {'google' | 'random'} source - How the identity was obtained
 */
/**
 * @typedef {Object} PayViaUser
 * @property {string} id
 * @property {string | null} email
 * @property {'google' | 'random'} identitySource
 * @property {boolean} paid - True if status is ACTIVE or TRIAL
 * @property {'ACTIVE' | 'TRIAL' | 'INACTIVE'} status
 * @property {Tier | null} tier
 * @property {string[]} features - Shortcut to tier.features
 * @property {string[]} planIds
 * @property {boolean} isTrial
 * @property {Date | null} [trialExpiresAt]
 * @property {number | null} [daysRemaining]
 * @property {Date | null} [canceledAt]
 * @property {Date | null} [currentPeriodEnd]
 * @property {boolean} [isCanceled]
 * @property {boolean} [cancelGraceActive]
 * @property {boolean} fromCache - True if data came from cache
 * @property {number | null} [checkedAt] - Unix timestamp in ms
 * @property {number | null} [ttl] - Cache TTL in ms
 * @property {string | null} [signature] - HMAC anti-tamper signature
 * @property {string} [error] - Set only when a network error occurred and no valid cache existed
 */
/**
 * @typedef {Object} TrialStartResult
 * @property {string} subscriptionId
 * @property {string} status
 * @property {string} planId
 * @property {string} planName
 * @property {Date} trialExpiresAt
 * @property {number} daysRemaining
 */
/**
 * @typedef {Object} TrialStatus
 * @property {string} status
 * @property {Date | null} trialExpiresAt
 * @property {number | null} daysRemaining
 * @property {boolean} canConvert
 * @property {string[]} planIds
 */
/**
 * @typedef {Object} Plan
 * @property {string} id
 * @property {string} name
 * @property {string} [description]
 * @property {number} [price]
 * @property {string} [currency]
 * @property {string} [interval]
 * @property {string} [tierId]
 */
/**
 * @typedef {Object} OpenPaymentPageOptions
 * @property {'pricing' | 'hosted' | 'direct'} [mode] - Checkout mode (default: 'pricing')
 * @property {string} [planId] - Required for 'hosted' and 'direct' modes
 * @property {string} [email] - Customer email (optional; PayPal collects it for anonymous users)
 * @property {string} [successUrl] - Redirect URL after successful payment ('direct' mode only)
 * @property {string} [cancelUrl] - Redirect URL if user cancels ('direct' mode only)
 */
/**
 * @typedef {Object} OpenPaymentPageResult
 * @property {string | null} [mode] - 'pricing' | 'hosted' for those modes; null/'iframe'/'redirect' for 'direct' mode (reflects PayVia backend response shape)
 * @property {string} [pricingUrl]
 * @property {string} [checkoutUrl]
 * @property {string} [sessionId]
 * @property {string} [provider] - 'PayPal' | 'Tranzila'
 */
/**
 * @typedef {Object} CancelSubscriptionOptions
 * @property {string} [planId] - Specific plan to cancel
 * @property {string} [reason] - Cancellation reason
 */
/**
 * @typedef {Object} CancelSubscriptionResult
 * @property {boolean} success
 * @property {string} message
 * @property {string} [canceledPlanId]
 */
/**
 * @typedef {Object} ResetLicenseResult
 * @property {string} message
 */
/**
 * @callback OnPaidCallback
 * @param {PayViaUser} user
 * @returns {void}
 */
/**
 * @typedef {Object} PayViaInstance
 * @property {(options?: { forceRefresh?: boolean }) => Promise<PayViaUser>} getUser
 * @property {() => Promise<PayViaUser>} refresh
 * @property {() => Promise<void>} refreshLicenseCache
 * @property {(featureName: string) => Promise<boolean>} hasFeature
 * @property {(requiredLevel: number) => Promise<boolean>} hasTierLevel
 * @property {() => Promise<Tier | null>} getTier
 * @property {() => Promise<TrialStartResult | null>} startTrial
 * @property {() => Promise<TrialStatus>} getTrialStatus
 * @property {() => Promise<boolean>} isFirstRun
 * @property {() => Promise<void>} markFirstRunDone
 * @property {() => Promise<boolean>} needsEmailForPayment
 * @property {() => Promise<Identity>} getIdentity
 * @property {(options?: OpenPaymentPageOptions) => Promise<OpenPaymentPageResult>} openPaymentPage
 * @property {(callback: OnPaidCallback) => (() => void)} onPaid
 * @property {() => Promise<Plan[]>} getPlans
 * @property {() => Promise<ResetLicenseResult>} resetLicense
 * @property {(options?: CancelSubscriptionOptions) => Promise<CancelSubscriptionResult>} cancelSubscription
 */
/**
 * Create a PayVia SDK instance.
 * @param {string} apiKey - API key from the PayVia dashboard
 * @returns {PayViaInstance} PayVia SDK instance
 */
declare function PayVia(apiKey: string): PayViaInstance;
