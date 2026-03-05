# PayVia SaaS Sample

This is a sample SaaS website demonstrating PayVia integration for web applications.

## Features

- **Basic Features**: Always available (free)
- **Advanced Features**: Unlocked via Pricing Page mode ($2.99)
- **Unlimited Usage**: Unlocked via Hosted Checkout mode ($4.99)
- **Priority Support**: Unlocked via Direct PayPal mode ($1.99)

## Getting Started

1. Open `index.html` in a web browser
2. The app will load and check your payment status
3. Click "Unlock" buttons to test different checkout modes
4. After payment, refresh the page to see unlocked features

## Demo Credentials

This sample uses shared demo credentials for testing. For production use, create your own project at [https://payvia.site/dashboard](https://payvia.site/dashboard).

## Integration Modes

- **Pricing Mode**: Shows all plans, user selects
- **Hosted Mode**: Direct checkout for specific plan
- **Direct Mode**: Straight to PayPal payment

## Files

- `index.html`: Main page with UI
- `app.js`: Application logic and PayVia integration
- `payvia.js`: PayVia SDK
- `styles.css`: (inline in HTML)