---
name: payvia-integration
description: שילוב תשתית תשלומים PayVia בתוספי כרום או אפליקציות SaaS. השתמש כשמפתח שואל על PayVia, קבלת תשלומים, מנויי PayPal, אימות רישיון או שכבות גישה.
user-invocable: true
argument-hint: "[new|existing] - האם למשתמש יש פרויקט PayVia קיים"
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
      - פייפאל
      - מנויים
      - תוספי כרום
      - SaaS
      - רישוי
      - שכבות גישה
      - מונטיזציה
---

# סקיל אינטגרציית PayVia

אתה עוזר למפתח לשלב תשתית תשלומים PayVia בתוסף הכרום או באפליקציית ה-SaaS שלו. PayVia מאפשר קבלת מנויי PayPal עם מינימום קוד.

## סקירה כללית

PayVia מספק:
- **דשבורד** - ניהול פרויקטים, תוכניות ומנויים בכתובת https://payvia.site
- **SDK** - ספריית JavaScript צד-לקוח לתוספים/אפליקציות (`payvia.js`)
- **API** - ממשק RESTful לאימות רישיון וצ'קאאוט
- **שרת MCP** - כלים לסוכני AI לניהול משאבי PayVia

## תחילת עבודה

לפני שילוב PayVia, קבע את נקודת ההתחלה של המפתח:

### האם יש לך כבר פרויקט PayVia?

**אם כן** (פרויקט שנוצר דרך הדשבורד):
1. אימות: `payvia_auth` (פותח דפדפן ל-OAuth)
2. רשימת פרויקטים: `payvia_list_projects`
3. הצג את הרשימה ושאל באיזה פרויקט להשתמש
4. פרטי פרויקט: `payvia_get_project(projectId)`
5. רשימת תוכניות: `payvia_list_plans(projectId)`
6. קבל מפתח API: `payvia_get_api_key(projectId)`
7. המשך ל**מדריך שילוב SDK**

**אם לא** (מתחילים מאפס):
1. עקוב אחרי **זרימת ההגדרה המלאה**

## זרימת הגדרה מלאה

1. **הגדרת פרויקט** (דרך MCP או דשבורד)
   - אימות: `payvia_auth`
   - יצירת פרויקט: `payvia_create_project`
   - הגדרת PayPal: `payvia_configure_paypal`
   - יצירת שכבות: `payvia_create_tier`
   - יצירת תוכניות מנוי: `payvia_create_plan`
   - סנכרון ל-PayPal: `payvia_sync_plan_to_paypal`
   - שמור את מפתח ה-API

2. **שילוב SDK** (בקוד התוסף/אפליקציה)
   - הוסף את PayVia SDK לפרויקט
   - אתחל עם מפתח ה-API
   - מימוש שכבות גישה לפי סטטוס מנוי
   - הוסף ממשק שדרוג/תשלום

## שילוב SDK

### שלב 1: הוספת ה-SDK

עבור תוספי כרום, הוסף ל-`manifest.json`:

```json
{
  "host_permissions": [
    "https://api.payvia.site/*",
    "https://payvia.site/*"
  ]
}
```

התקנה:

```bash
npm install @payvia-sdk/sdk
```

או העתק `payvia.js` ישירות לתיקיית `lib/` של התוסף.

### שלב 2: אתחול

```javascript
import PayVia from './lib/payvia.js';
const payvia = PayVia('YOUR_API_KEY');
```

### שלב 3: בדיקת סטטוס מנוי

```javascript
const user = await payvia.getUser();

if (user.paid) {
  // למשתמש יש גישה פרימיום
  // user.tier - מידע על השכבה (id, name, level, features)
  // user.features - קיצור ל-user.tier.features
  // user.isTrial - האם בתקופת ניסיון
  // user.cancelGraceActive - האם בוטל אבל עדיין בתוקף
}
```

### שלב 4: שכבות גישה (Tier-Based)

```javascript
// בדיקה לפי רמת שכבה (0=חינם, 1=Pro, 2=Super)
const hasPro = await payvia.hasTierLevel(1);

// בדיקה לפי פיצ'ר ספציפי
const canExport = await payvia.hasFeature('export_pdf');

// קבלת מידע שכבה
const tier = await payvia.getTier();
```

### שלב 5: דף תשלום

```javascript
// מצב 1: דף תמחור (מומלץ)
await payvia.openPaymentPage({ mode: 'pricing' });

// מצב 2: צ'קאאוט ישיר לתוכנית ספציפית
await payvia.openPaymentPage({ mode: 'hosted', planId: 'PLAN_UUID' });

// מצב 3: ישירות ל-PayPal
await payvia.openPaymentPage({ mode: 'direct', planId: 'PLAN_UUID' });
```

### שלב 6: תקופת ניסיון

```javascript
if (await payvia.isFirstRun()) {
  await payvia.startTrial();
  await payvia.markFirstRunDone();
}
```

### שלב 7: ביטול מנוי עם תקופת חסד

```javascript
const user = await payvia.getUser();

if (user.cancelGraceActive) {
  // המנוי בוטל אבל הגישה ממשיכה עד currentPeriodEnd
  const endDate = user.currentPeriodEnd.toLocaleDateString();
  showBanner(`המנוי בוטל. הגישה ממשיכה עד ${endDate}`);
}
```

## כלי MCP

### אימות
- `payvia_auth` - אימות דרך דפדפן (OAuth)
- `payvia_auth_status` - בדיקת סטטוס אימות
- `payvia_logout` - התנתקות

### ניהול פרויקטים
- `payvia_list_projects` - רשימת פרויקטים
- `payvia_create_project` - יצירת פרויקט חדש
- `payvia_get_project` - פרטי פרויקט
- `payvia_get_project_stats` - סטטיסטיקות

### ניהול שכבות ותוכניות
- `payvia_list_tiers` / `payvia_create_tier` / `payvia_update_tier` / `payvia_delete_tier`
- `payvia_list_plans` / `payvia_create_plan` / `payvia_update_plan` / `payvia_delete_plan`
- `payvia_sync_plan_to_paypal` - סנכרון תוכנית ל-PayPal

### ניהול מנויים
- `payvia_list_subscribers` - רשימת מנויים
- `payvia_add_subscriber` - הוספת מנוי ידנית
- `payvia_update_subscriber` - עדכון סטטוס מנוי
- `payvia_delete_subscriber` - מחיקת מנוי

### רישיון
- `payvia_validate_license` - בדיקת רישיון פעיל
- `payvia_get_subscription_status` - סטטוס מנוי מפורט

## משאבים

- **דשבורד**: https://payvia.site
- **API**: https://api.payvia.site
- **תוסף לדוגמה**: תיקיית `sample-extension/`
- **אפליקציית SaaS לדוגמה**: תיקיית `sample-saas/`
