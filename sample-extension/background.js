/**
 * Sample Extension - Background Service Worker
 * Optional: handles background tasks
 */

import PayVia from './payvia.js';

// This API key matches the canonical Demo Extension project created during database seeding
// It allows the sample-extension to work out-of-the-box with the demo project
const PAYVIA_API_KEY = 'pv_demo_XXXXXXXXXXXXXXXXXXXXXXXX';
const payvia = PayVia(PAYVIA_API_KEY);

// Refresh license cache on extension startup
chrome.runtime.onStartup.addListener(async () => {
    try {
        await payvia.refreshLicenseCache();
        console.log('PayVia: License cache refreshed on startup');
    } catch (e) {
        console.log('PayVia: License cache refresh failed:', e.message);
    }
});

// Refresh cache on extension install/update
chrome.runtime.onInstalled.addListener(async () => {
    try {
        await payvia.refresh();
        console.log('PayVia: License refreshed on install/update');
    } catch (e) {
        console.log('PayVia: License refresh failed:', e.message);
    }
});

// Handle messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'checkPaid') {
        payvia.getUser().then(user => {
            sendResponse({ paid: user.paid, user });
        });
        return true; // async response
    }

    if (request.action === 'openPayment') {
        payvia.openPaymentPage(request.options).then(response => {
            sendResponse(response);
        }).catch(error => {
            sendResponse({ error: error.message });
        });
        return true;
    }

    if (request.action === 'getIdentity') {
        payvia.getIdentity().then(identity => {
            sendResponse(identity);
        });
        return true;
    }
});

// Optional: Check status periodically (every 5 minutes)
setInterval(async () => {
    try {
        const user = await payvia.getUser();
        console.log('PayVia status check:', user.paid ? 'Premium' : 'Free', '| Source:', user.identitySource);
    } catch (e) {
        console.log('PayVia status check failed:', e.message);
    }
}, 300000); // Every 5 minutes
