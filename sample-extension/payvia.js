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

function PayVia(apiKey) {
    if (!apiKey) {
        throw new Error('PayVia: API key is required');
    }

    const PAYVIA_API_URL = 'https://api.payvia.site';

    const instance = {};
    let cachedUser = null;
    let userPromise = null;
    let cachedIdentity = null; // Stores { id, email, source }

    /**
     * Try to get the user's Google account email via chrome.identity
     * @returns {Promise<{email: string, source: 'google'} | null>}
     */
    async function getGoogleIdentity() {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.identity && chrome.identity.getProfileUserInfo) {
                chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, (userInfo) => {
                    if (chrome.runtime.lastError) {
                        console.log('PayVia: Could not get Google identity:', chrome.runtime.lastError.message);
                        resolve(null);
                        return;
                    }
                    if (userInfo && userInfo.email) {
                        resolve({ email: userInfo.email, source: 'google' });
                    } else {
                        resolve(null);
                    }
                });
            } else {
                resolve(null);
            }
        });
    }

    /**
     * Get or generate a random fallback ID
     * @returns {Promise<string>}
     */
    async function getRandomId() {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
                chrome.storage.sync.get(['payvia_user_id'], (result) => {
                    if (result.payvia_user_id) {
                        resolve(result.payvia_user_id);
                    } else {
                        const newUserId = 'pv_' + generateUUID();
                        chrome.storage.sync.set({ payvia_user_id: newUserId }, () => {
                            resolve(newUserId);
                        });
                    }
                });
            } else {
                // Fallback for non-extension environments (testing)
                let userId = localStorage.getItem('payvia_user_id');
                if (!userId) {
                    userId = 'pv_' + generateUUID();
                    localStorage.setItem('payvia_user_id', userId);
                }
                resolve(userId);
            }
        });
    }

    /**
     * Get user identity - tries Google first, falls back to random ID
     * @returns {Promise<{id: string, email: string | null, source: 'google' | 'random'}>}
     */
    async function getUserIdentity() {
        if (cachedIdentity) {
            return cachedIdentity;
        }

        // Try Google Identity first
        const googleInfo = await getGoogleIdentity();
        if (googleInfo && googleInfo.email) {
            cachedIdentity = {
                id: googleInfo.email, // Use email as the ID
                email: googleInfo.email,
                source: 'google'
            };
            console.log('PayVia: Using Google identity:', cachedIdentity.email);
            return cachedIdentity;
        }

        // Fall back to random ID
        const randomId = await getRandomId();
        cachedIdentity = {
            id: randomId,
            email: null, // No email available
            source: 'random'
        };
        console.log('PayVia: Using random identity:', cachedIdentity.id);
        return cachedIdentity;
    }

    /**
     * Generate UUID v4
     */
    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Make API request to PayVia server
     */
    async function apiRequest(endpoint, options = {}) {
        const response = await fetch(`${PAYVIA_API_URL}${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey,
                ...options.headers,
            },
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Request failed' }));
            throw new Error(error.error || 'PayVia API request failed');
        }

        return response.json();
    }

    /**
     * Get user's payment status
     * @returns {Promise<PayViaUser>} User object with payment status
     */
    instance.getUser = async function () {
        if (cachedUser) {
            return cachedUser;
        }

        if (userPromise) {
            return userPromise;
        }

        userPromise = (async () => {
            try {
                const identity = await getUserIdentity();
                const response = await apiRequest('/api/v1/license/validate', {
                    method: 'POST',
                    body: JSON.stringify({ customerId: identity.id, email: identity.email }),
                });

                cachedUser = {
                    id: identity.id,
                    email: identity.email,
                    identitySource: identity.source,
                    paid: response.status === 'ACTIVE' || response.status === 'TRIAL',
                    status: response.status,
                    planIds: response.planIds || [],  // List of purchased/trial plan IDs
                    subscriptionId: response.subscriptionId || null,
                    planId: response.planId || null,
                    expiresAt: response.currentPeriodEnd ? new Date(response.currentPeriodEnd) : null,
                    // Trial-specific fields
                    isTrial: response.isTrial || response.status === 'TRIAL',
                    trialExpiresAt: response.trialExpiresAt ? new Date(response.trialExpiresAt) : null,
                    trialDaysRemaining: response.daysRemaining || null,
                };

                return cachedUser;
            } catch (error) {
                console.error('PayVia: Failed to get user status', error);
                const identity = await getUserIdentity();
                return {
                    id: identity.id,
                    email: identity.email,
                    identitySource: identity.source,
                    paid: false,
                    status: 'UNKNOWN',
                    error: error.message,
                };
            } finally {
                userPromise = null;
            }
        })();

        return userPromise;
    };

    /**
     * Force refresh user status from server
     * @returns {Promise<PayViaUser>} Updated user object
     */
    instance.refresh = async function () {
        cachedUser = null;
        return instance.getUser();
    };

    /**
     * Start a trial for the current user
     * Call this when user first installs/uses the extension
     * Idempotent: if user already has a trial/active subscription, returns existing info
     * @returns {Promise<{subscriptionId: string, status: string, planId: string, planName: string, trialExpiresAt: Date, daysRemaining: number} | null>}
     */
    instance.startTrial = async function () {
        try {
            const identity = await getUserIdentity();
            const response = await apiRequest('/api/v1/trial/start', {
                method: 'POST',
                body: JSON.stringify({
                    customerId: identity.id,
                    email: identity.email,
                }),
            });

            // Clear cached user so next getUser() fetches fresh data
            cachedUser = null;

            return {
                subscriptionId: response.subscriptionId,
                status: response.status,
                planId: response.planId,
                planName: response.planName,
                trialExpiresAt: new Date(response.trialExpiresAt),
                daysRemaining: response.daysRemaining,
            };
        } catch (error) {
            // If trial is not configured or user already had trial, return null
            console.log('PayVia: Could not start trial:', error.message);
            return null;
        }
    };

    /**
     * Get trial status for the current user
     * @returns {Promise<{status: string, trialExpiresAt: Date | null, daysRemaining: number | null, canConvert: boolean, planIds: string[]}>}
     */
    instance.getTrialStatus = async function () {
        try {
            const identity = await getUserIdentity();
            const response = await apiRequest('/api/v1/trial/status', {
                method: 'POST',
                body: JSON.stringify({ customerId: identity.id }),
            });

            return {
                status: response.status,
                trialExpiresAt: response.trialExpiresAt ? new Date(response.trialExpiresAt) : null,
                daysRemaining: response.daysRemaining || null,
                canConvert: response.canConvert,
                planIds: response.planIds || [],
            };
        } catch (error) {
            console.error('PayVia: Failed to get trial status', error);
            return {
                status: 'UNKNOWN',
                trialExpiresAt: null,
                daysRemaining: null,
                canConvert: true,
                planIds: [],
            };
        }
    };

    /**
     * Check if this is the first time the extension is being used
     * @returns {Promise<boolean>}
     */
    instance.isFirstRun = async function () {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.get(['payvia_first_run_done'], (result) => {
                    resolve(!result.payvia_first_run_done);
                });
            } else {
                // Fallback for non-extension environments
                resolve(!localStorage.getItem('payvia_first_run_done'));
            }
        });
    };

    /**
     * Mark first run as complete
     */
    instance.markFirstRunDone = async function () {
        return new Promise((resolve) => {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.set({ payvia_first_run_done: true }, resolve);
            } else {
                localStorage.setItem('payvia_first_run_done', 'true');
                resolve();
            }
        });
    };

    /**
     * Reset the user's license (delete all subscriptions).
     * This is for demo/testing purposes only.
     * @returns {Promise<{message: string}>}
     */
    instance.resetLicense = async function () {
        const identity = await getUserIdentity();
        const response = await apiRequest('/api/v1/license/reset', {
            method: 'POST',
            body: JSON.stringify({ customerId: identity.id }),
        });
        // Clear cached user so next getUser() fetches fresh data
        cachedUser = null;
        return response;
    };

    /**
     * Check if email is required for payment (user has no Google identity)
     * @returns {Promise<boolean>}
     */
    instance.needsEmailForPayment = async function () {
        const identity = await getUserIdentity();
        return identity.source === 'random';
    };

    /**
     * Get the current user identity info
     * @returns {Promise<{id: string, email: string | null, source: 'google' | 'random'}>}
     */
    instance.getIdentity = async function () {
        return getUserIdentity();
    };

    /**
     * Open payment page for the user
     * @param {Object} options - Payment options
     * @param {string} options.planId - Plan ID to purchase (not required for 'pricing' mode)
     * @param {string} options.email - Customer email (required if not using Google identity)
     * @param {'pricing'|'hosted'|'direct'} options.mode - Checkout mode:
     *   - 'pricing': Shows all plans for user to choose (recommended)
     *   - 'hosted': Goes directly to checkout for specific plan
     *   - 'direct': Bypasses PayVia, goes straight to PayPal
     * @param {string} options.successUrl - URL to redirect after successful payment (direct mode only)
     * @param {string} options.cancelUrl - URL to redirect if user cancels (direct mode only)
     */
    instance.openPaymentPage = async function (options = {}) {
        const identity = await getUserIdentity();

        // Determine the email to use
        let customerEmail = options.email || identity.email;

        if (!customerEmail) {
            throw new Error('Email is required for payment. Please provide an email address.');
        }

        const mode = options.mode || 'pricing'; // Default to pricing mode

        const PAYVIA_BASE_URL = 'https://payvia.site';

        if (mode === 'pricing') {
            // Pricing mode: Show all plans for user to choose
            // First, get a secure checkout token from the API (API key stays server-side)
            const tokenResponse = await apiRequest('/api/v1/checkout/token', {
                method: 'POST',
                body: JSON.stringify({
                    customerId: identity.id,
                    customerEmail: customerEmail,
                    mode: 'pricing',
                }),
            });

            const params = new URLSearchParams({
                token: tokenResponse.token,
            });

            const pricingUrl = `${PAYVIA_BASE_URL}/pricing?${params.toString()}`;

            if (typeof chrome !== 'undefined' && chrome.tabs) {
                chrome.tabs.create({ url: pricingUrl });
            } else {
                window.open(pricingUrl, '_blank');
            }

            return { mode: 'pricing', pricingUrl };
        } else if (mode === 'hosted') {
            // Hosted mode: Redirect to PayVia checkout page for specific plan
            if (!options.planId) {
                throw new Error('planId is required for hosted mode');
            }

            // Get a secure checkout token from the API (API key stays server-side)
            const tokenResponse = await apiRequest('/api/v1/checkout/token', {
                method: 'POST',
                body: JSON.stringify({
                    customerId: identity.id,
                    customerEmail: customerEmail,
                    planId: options.planId,
                    mode: 'checkout',
                }),
            });

            const params = new URLSearchParams({
                token: tokenResponse.token,
            });

            const checkoutUrl = `${PAYVIA_BASE_URL}/checkout?${params.toString()}`;

            if (typeof chrome !== 'undefined' && chrome.tabs) {
                chrome.tabs.create({ url: checkoutUrl });
            } else {
                window.open(checkoutUrl, '_blank');
            }

            return { mode: 'hosted', checkoutUrl };
        } else {
            // Direct mode: Call API and redirect straight to PayPal
            if (!options.planId) {
                throw new Error('planId is required for direct mode');
            }

            try {
                const response = await apiRequest('/api/v1/checkout-session', {
                    method: 'POST',
                    body: JSON.stringify({
                        planId: options.planId,
                        customerId: identity.id,
                        customerEmail: customerEmail,
                        successUrl: options.successUrl || `${PAYVIA_API_URL}/api/v1/checkout-session/complete`,
                        cancelUrl: options.cancelUrl || `${PAYVIA_API_URL}/api/v1/checkout-session/cancel`,
                    }),
                });

                // Open PayPal checkout in new tab
                if (response.checkoutUrl) {
                    if (typeof chrome !== 'undefined' && chrome.tabs) {
                        chrome.tabs.create({ url: response.checkoutUrl });
                    } else {
                        window.open(response.checkoutUrl, '_blank');
                    }
                }

                return { mode: 'direct', ...response };
            } catch (error) {
                console.error('PayVia: Failed to open payment page', error);
                throw error;
            }
        }
    };

    /**
     * Listen for payment status changes
     * @param {Function} callback - Called when payment status changes
     */
    instance.onPaid = function (callback) {
        // Poll for status changes every 5 seconds when tab is visible
        let lastPaidStatus = null;

        const checkStatus = async () => {
            const user = await instance.refresh();
            if (lastPaidStatus !== null && lastPaidStatus !== user.paid) {
                callback(user);
            }
            lastPaidStatus = user.paid;
        };

        // Check immediately
        checkStatus();

        // Set up polling
        const intervalId = setInterval(checkStatus, 5000);

        // Return cleanup function
        return () => clearInterval(intervalId);
    };

    /**
     * Get available plans for this project
     * @returns {Promise<Plan[]>} List of available plans
     */
    instance.getPlans = async function () {
        try {
            const response = await apiRequest('/api/v1/plans');
            return response;
        } catch (error) {
            console.error('PayVia: Failed to get plans', error);
            return [];
        }
    };

    /**
     * Cancel a subscription for the current user
     * @param {Object} options - Cancel options
     * @param {string} options.planId - Specific plan to cancel (optional)
     * @param {string} options.reason - Cancellation reason (optional)
     * @returns {Promise<{success: boolean, message: string, canceledPlanId: string}>}
     */
    instance.cancelSubscription = async function (options = {}) {
        const identity = await getUserIdentity();

        const response = await apiRequest('/api/v1/license/cancel', {
            method: 'POST',
            body: JSON.stringify({
                customerId: identity.id,
                planId: options.planId || null,
                reason: options.reason || 'User requested cancellation',
            }),
        });

        // Clear cached user so next getUser() fetches fresh data
        cachedUser = null;

        return response;
    };

    return instance;
}

export default PayVia;
