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

    // const PAYVIA_API_URL = 'http://localhost:5000'; // Development
    const PAYVIA_API_URL = 'https://api.payvia.site'; // Production

    const LICENSE_CACHE_KEY = 'payvia_license_cache';
    const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
    const GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

    const instance = {};
    let cachedUser = null;
    let userPromise = null;
    let cachedIdentity = null; // Stores { id, email, source }

    // ============ License Cache Storage ============

    /**
     * Get storage interface (localStorage for browser)
     */
    function getStorage() {
        return {
            async get(key) {
                const value = localStorage.getItem(key);
                return value ? JSON.parse(value) : null;
            },
            async set(key, value) {
                localStorage.setItem(key, JSON.stringify(value));
            }
        };
    }

    /**
     * Get cached license data
     */
    async function getCachedLicense() {
        try {
            const storage = getStorage();
            return await storage.get(LICENSE_CACHE_KEY);
        } catch (error) {
            console.warn('PayVia: Failed to read license cache', error);
            return null;
        }
    }

    /**
     * Save license data to cache
     */
    async function setCachedLicense(data) {
        try {
            const storage = getStorage();
            await storage.set(LICENSE_CACHE_KEY, data);
        } catch (error) {
            console.warn('PayVia: Failed to write license cache', error);
        }
    }

    /**
     * Check if cache is still valid (within TTL)
     */
    function isCacheValid(cache) {
        if (!cache || !cache.checkedAt) return false;
        const ttl = cache.ttl || DEFAULT_TTL_MS;
        return Date.now() < cache.checkedAt + ttl;
    }

    /**
     * Check if cache is within grace period (expired but still usable offline)
     */
    function isWithinGracePeriod(cache) {
        if (!cache || !cache.checkedAt) return false;
        const ttl = cache.ttl || DEFAULT_TTL_MS;
        return Date.now() < cache.checkedAt + ttl + GRACE_PERIOD_MS;
    }

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
                // Check if email is stored for web login
                const storedEmail = localStorage.getItem('payvia_email');
                if (storedEmail) {
                    resolve(storedEmail);
                } else {
                    let userId = localStorage.getItem('payvia_user_id');
                    if (!userId) {
                        userId = 'pv_' + generateUUID();
                        localStorage.setItem('payvia_user_id', userId);
                    }
                    resolve(userId);
                }
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

        // Fall back to random ID or stored email
        const randomId = await getRandomId();
        const storedEmail = localStorage.getItem('payvia_email');
        if (storedEmail && randomId === storedEmail) {
            cachedIdentity = {
                id: storedEmail,
                email: storedEmail,
                source: 'random' // Still random, but with email
            };
            console.log('PayVia: Using stored email identity:', cachedIdentity.email);
        } else {
            cachedIdentity = {
                id: randomId,
                email: null, // No email available
                source: 'random'
            };
            console.log('PayVia: Using random identity:', cachedIdentity.id);
        }
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
     * Build user object from cache data
     */
    function buildUserFromCache(identity, cache, fromCache) {
        return {
            id: identity.id,
            email: identity.email,
            identitySource: identity.source,
            paid: cache.status === 'ACTIVE' || cache.status === 'TRIAL',
            status: cache.status,
            tier: cache.tier || null,
            features: cache.tier?.features || [],
            planIds: cache.planIds || [],
            isTrial: cache.isTrial || false,
            trialEndsAt: cache.trialExpiresAt ? new Date(cache.trialExpiresAt) : null,
            trialDaysRemaining: cache.daysRemaining || null,
            fromCache: fromCache,
        };
    }

    /**
     * Get user's payment status
     * Uses cache first, then server. Falls back to cache during network errors.
     * @param {Object} options - Options
     * @param {boolean} options.forceRefresh - Force fetch from server
     * @returns {Promise<PayViaUser>} User object with payment status
     */
    instance.getUser = async function (options = {}) {
        const identity = await getUserIdentity();

        // Check in-memory cache first
        if (cachedUser && !options.forceRefresh) {
            return cachedUser;
        }

        if (userPromise) {
            return userPromise;
        }

        userPromise = (async () => {
            try {
                // Check persistent cache
                if (!options.forceRefresh) {
                    const cached = await getCachedLicense();
                    if (cached && isCacheValid(cached)) {
                        cachedUser = buildUserFromCache(identity, cached, true);
                        return cachedUser;
                    }
                }

                // Fetch from server
                const response = await apiRequest('/api/v1/license/validate', {
                    method: 'POST',
                    body: JSON.stringify({ customerId: identity.id, email: identity.email }),
                });

                // Save to cache
                const cacheData = {
                    status: response.status,
                    planIds: response.planIds || [],
                    tier: response.tier || null,
                    isTrial: response.isTrial || false,
                    trialExpiresAt: response.trialExpiresAt || null,
                    daysRemaining: response.daysRemaining || null,
                    checkedAt: response.checkedAt || Date.now(),
                    ttl: response.ttl || DEFAULT_TTL_MS,
                    signature: response.signature || null,
                };
                await setCachedLicense(cacheData);

                cachedUser = buildUserFromCache(identity, cacheData, false);
                return cachedUser;
            } catch (error) {
                console.error('PayVia: Failed to get user status', error);

                // Try to use cached data if within grace period
                const cached = await getCachedLicense();
                if (cached && isWithinGracePeriod(cached)) {
                    console.log('PayVia: Using cached license (network error, within grace period)');
                    cachedUser = buildUserFromCache(identity, cached, true);
                    return cachedUser;
                }

                // No valid cache, return inactive
                return {
                    id: identity.id,
                    email: identity.email,
                    identitySource: identity.source,
                    paid: false,
                    status: 'INACTIVE',
                    tier: null,
                    features: [],
                    planIds: [],
                    isTrial: false,
                    fromCache: false,
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
        return instance.getUser({ forceRefresh: true });
    };

    /**
     * Refresh license cache from server (for background refresh)
     * @returns {Promise<void>}
     */
    instance.refreshLicenseCache = async function () {
        const cached = await getCachedLicense();
        if (!cached || !isCacheValid(cached)) {
            await instance.refresh();
        }
    };

    /**
     * Check if user has a specific feature
     * @param {string} featureName - Feature name to check
     * @returns {Promise<boolean>}
     */
    instance.hasFeature = async function (featureName) {
        const user = await instance.getUser();
        if (!user.tier || !user.tier.features) return false;
        return user.tier.features.includes(featureName);
    };

    /**
     * Check if user has a tier at or above the required level
     * @param {number} requiredLevel - Minimum tier level required
     * @returns {Promise<boolean>}
     */
    instance.hasTierLevel = async function (requiredLevel) {
        const user = await instance.getUser();
        if (!user.tier) return false;
        return user.tier.level >= requiredLevel;
    };

    /**
     * Get the user's current tier info
     * @returns {Promise<{id: string, name: string, level: number, features: string[]}|null>}
     */
    instance.getTier = async function () {
        const user = await instance.getUser();
        return user.tier || null;
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

        // const PAYVIA_BASE_URL = 'http://localhost:3000'; // Development
        const PAYVIA_BASE_URL = 'https://payvia-dashboard.vercel.app'; // Production

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

    return instance;
}

export default PayVia;