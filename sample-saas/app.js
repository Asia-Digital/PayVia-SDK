/**
 * Sample SaaS Demo - App Script
 * Demonstrates PayVia integration with Smart Identity
 *
 * ┌────────────────────────────────────────────────────────────────────┐
 * │  ⚠️  SHARED DEMO PROJECT - FOR TESTING ONLY                        │
 * │                                                                    │
 * │  This demo uses a shared demo API key that works out of the       │
 * │  box for testing. All users share the same demo project.          │
 * │                                                                    │
 * │  To receive REAL payments, create your own project at:            │
 * │  https://payvia.site/dashboard                                     │
 * │                                                                    │
 * │  Then replace PAYVIA_API_KEY and PLAN IDs below with your         │
 * │  own values from the dashboard.                                   │
 * └────────────────────────────────────────────────────────────────────┘
 *
 * DEMO: Each checkout mode unlocks a different feature:
 *   - Pricing Page (mode: 'pricing')  → Advanced features
 *   - Specific Plan (mode: 'hosted')  → Unlimited usage
 *   - PayPal Direct (mode: 'direct')  → Priority support
 */

import PayVia from './payvia.js';

// 🧪 DEMO CREDENTIALS - Shared demo project for testing
// Replace with your own values from https://payvia.site/dashboard
const PAYVIA_API_KEY = 'pv_demo_XXXXXXXXXXXXXXXXXXXXXXXX';

// Tier configuration - feature-based access levels
const TIER_CONFIG = {
    free: { level: 0, name: 'Free' },
    pro: { level: 1, name: 'Pro' },
    super: { level: 2, name: 'Super' }
};

// Feature requirements - what tier/feature is needed
const FEATURE_REQUIREMENTS = {
    advanced: { minLevel: 1 },               // Pro or above
    unlimited: { feature: 'unlimited_usage' }, // Specific feature
    support: { minLevel: 2 }                  // Super only
};

// Legacy plan IDs (for backward compatibility with existing purchases)
const PLAN_IDS = {
    advanced: '11111111-0000-0000-0000-000000000001',  // Advanced Features ($2.99)
    unlimited: '22222222-0000-0000-0000-000000000002', // Unlimited Usage ($4.99)
    support: '33333333-0000-0000-0000-000000000003'    // Priority Support ($1.99)
};

const payvia = PayVia(PAYVIA_API_KEY);

/**
 * Check if user can access a feature based on tier or feature list
 * @param {Object} user - User object from payvia.getUser()
 * @param {string} featureName - Feature to check (advanced, unlimited, support)
 * @returns {boolean}
 */
function canUseFeature(user, featureName) {
    const req = FEATURE_REQUIREMENTS[featureName];
    if (!req) return false;

    // Legacy support: check planIds first
    if (user.planIds && user.planIds.includes(PLAN_IDS[featureName])) {
        return true;
    }

    // Tier-based check
    if (!user.tier) return false;

    if (req.minLevel !== undefined) {
        return user.tier.level >= req.minLevel;
    }
    if (req.feature) {
        return user.tier.features?.includes(req.feature) || false;
    }
    return false;
}

async function init() {
    const loginEl = document.getElementById('login');
    const contentEl = document.getElementById('content');
    const loginEmailEl = document.getElementById('login-email');
    const loginBtn = document.getElementById('login-btn');
    const loginErrorEl = document.getElementById('login-error');

    // Check if logged in
    const storedEmail = localStorage.getItem('payvia_email');
    if (!storedEmail) {
        // Show login
        loginEl.style.display = 'block';
        contentEl.style.display = 'none';

        loginBtn.addEventListener('click', async () => {
            const email = loginEmailEl.value.trim();
            if (!email || !isValidEmail(email)) {
                loginErrorEl.textContent = 'Please enter a valid email address';
                loginErrorEl.style.display = 'block';
                return;
            }
            loginErrorEl.style.display = 'none';
            localStorage.setItem('payvia_email', email);
            location.reload();
        });

        return;
    }

    // Logged in, proceed as before
    const loadingEl = document.getElementById('loading');
    const statusTitleEl = document.getElementById('status-title');
    const statusSubtitleEl = document.getElementById('status-subtitle');
    const userIdEl = document.getElementById('user-id');
    const emailSectionEl = document.getElementById('email-section');
    const emailInputEl = document.getElementById('email-input');
    const emailErrorEl = document.getElementById('email-error');
    const resetBtn = document.getElementById('reset-btn');

    try {
        // Get user payment status from server
        const user = await payvia.getUser();

        // Show user ID and identity source (for debugging)
        const sourceLabel = user.identitySource === 'google' ? '🔗 Google' : '🎲 Random';
        userIdEl.textContent = `${sourceLabel}: ${user.id}`;

        // Hide loading, show content
        loadingEl.classList.add('hidden');
        contentEl.style.display = 'block';

        // Determine unlocked features based on tier level and features
        const unlockedFeatures = [];
        const allFeatures = ['advanced', 'unlimited', 'support'];
        for (const feature of allFeatures) {
            if (canUseFeature(user, feature)) {
                unlockedFeatures.push(feature);
            }
        }

        // Update UI based on unlocked features
        updateFeaturesUI(unlockedFeatures);
        updateStatusCard(unlockedFeatures, statusTitleEl, statusSubtitleEl, user);

        // Check if we need to show email input
        const needsEmail = await payvia.needsEmailForPayment();
        if (needsEmail) {
            emailSectionEl.classList.remove('hidden');
        }

        // Setup unlock button handlers
        setupUnlockButtons(needsEmail, emailInputEl, emailErrorEl, unlockedFeatures);

        // Setup reset button - deletes all subscriptions to start fresh
        resetBtn.addEventListener('click', async () => {
            if (!confirm('This will reset all your unlocked features. Continue?')) {
                return;
            }
            try {
                await payvia.resetLicense();
                location.reload();
            } catch (error) {
                console.error('Reset failed:', error);
                alert('Failed to reset: ' + error.message);
            }
        });

        // Setup logout button
        const logoutBtn = document.getElementById('logout-btn');
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('payvia_email');
            localStorage.removeItem('payvia_user_id');
            location.reload();
        });

        // Listen for real-time payment updates
        // (Currently not using webhooks, so user re-opens page after payment)
        // This is here for future webhook support
        payvia.onPaid(async (updatedUser) => {
            if (updatedUser.paid) {
                // Refresh to show updated features from server
                location.reload();
            }
        });

    } catch (error) {
        console.error('PayVia error:', error);
        loadingEl.innerHTML = `
      <p style="color: #ef4444;">Error loading</p>
      <p style="font-size: 14px; margin-top: 8px;">${error.message}</p>
    `;
    }
}

function updateFeaturesUI(unlockedFeatures) {
    const features = ['advanced', 'unlimited', 'support'];

    features.forEach(feature => {
        const iconEl = document.getElementById(`icon-${feature}`);
        const btnEl = document.getElementById(`btn-${feature}`);

        if (unlockedFeatures.includes(feature)) {
            // Feature is unlocked
            iconEl.classList.remove('locked');
            iconEl.classList.add('unlocked');
            iconEl.textContent = '✓';

            // Replace button with badge
            btnEl.outerHTML = '<span class="unlocked-badge">✓ Unlocked</span>';
        }
    });
}

function updateStatusCard(unlockedFeatures, titleEl, subtitleEl, user = null) {
    const count = unlockedFeatures.length;
    const total = 3;
    const tierName = user?.tier?.name || 'Free';
    const tierLevel = user?.tier?.level || 0;

    // Check if user is on trial
    if (user && user.isTrial && user.trialDaysRemaining !== null) {
        titleEl.textContent = `🎁 ${tierName} Trial`;
        subtitleEl.textContent = `${user.trialDaysRemaining} days left to explore`;
        return;
    }

    // Show tier-based status
    if (tierLevel === 0 && count === 0) {
        titleEl.textContent = 'Free Version';
        subtitleEl.textContent = 'Click Unlock to try each checkout mode';
    } else if (tierLevel >= 2) {
        titleEl.textContent = `🎉 ${tierName} Tier`;
        subtitleEl.textContent = 'All features unlocked!';
    } else if (tierLevel === 1) {
        titleEl.textContent = `⭐ ${tierName} Tier`;
        subtitleEl.textContent = `${count}/${total} features unlocked`;
    } else if (count > 0) {
        // Legacy plan-based display
        titleEl.textContent = `${count}/${total} Features Unlocked`;
        subtitleEl.textContent = 'Keep going! Try other checkout modes';
    }
}

function setupUnlockButtons(needsEmail, emailInputEl, emailErrorEl, unlockedFeatures) {
    // Advanced → Pricing Page mode
    const btnAdvanced = document.getElementById('btn-advanced');
    if (btnAdvanced && !unlockedFeatures.includes('advanced')) {
        btnAdvanced.addEventListener('click', () => {
            handleUnlock('pricing', 'advanced', needsEmail, emailInputEl, emailErrorEl);
        });
    }

    // Unlimited → Hosted mode (specific plan)
    const btnUnlimited = document.getElementById('btn-unlimited');
    if (btnUnlimited && !unlockedFeatures.includes('unlimited')) {
        btnUnlimited.addEventListener('click', () => {
            handleUnlock('hosted', 'unlimited', needsEmail, emailInputEl, emailErrorEl);
        });
    }

    // Support → Direct PayPal mode
    const btnSupport = document.getElementById('btn-support');
    if (btnSupport && !unlockedFeatures.includes('support')) {
        btnSupport.addEventListener('click', () => {
            handleUnlock('direct', 'support', needsEmail, emailInputEl, emailErrorEl);
        });
    }
}

async function handleUnlock(mode, featureName, needsEmail, emailInputEl, emailErrorEl) {
    const email = getEmail(needsEmail, emailInputEl, emailErrorEl);
    if (needsEmail && !email) return;

    try {
        // Open the appropriate payment page with the matching plan
        const options = { mode };

        // Each feature has its own plan
        if (mode === 'hosted') {
            options.planId = PLAN_IDS.unlimited; // Unlimited Usage plan
        } else if (mode === 'direct') {
            options.planId = PLAN_IDS.support; // Priority Support plan
        }
        // Note: 'pricing' mode shows all plans - user selects which one to buy

        if (email) {
            options.email = email;
        }

        await payvia.openPaymentPage(options);

        // After payment, user closes tab and re-opens page
        // The page will fetch fresh data from server via getUser()

    } catch (error) {
        showError(error, emailErrorEl);
    }
}

function getEmail(needsEmail, emailInputEl, emailErrorEl) {
    if (!needsEmail) return null;

    const email = emailInputEl.value.trim();
    if (!email || !isValidEmail(email)) {
        emailErrorEl.textContent = 'Please enter a valid email address';
        emailErrorEl.classList.remove('hidden');
        emailInputEl.style.borderColor = '#ef4444';
        return null;
    }

    emailErrorEl.classList.add('hidden');
    emailInputEl.style.borderColor = '#d1d5db';
    return email;
}

function showError(error, emailErrorEl) {
    console.error('Payment error:', error);
    if (emailErrorEl) {
        emailErrorEl.textContent = error.message;
        emailErrorEl.classList.remove('hidden');
    }
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);