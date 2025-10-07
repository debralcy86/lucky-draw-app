# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)

Telegram Mini App `initData` Verification — Debug Log (Sep 30, 2025)

Issue:  
/api/verify endpoint crashing with FUNCTION_INVOCATION_FAILED during Telegram onboarding.

Steps Taken:

1.  Initial curl test:
  ⁠◦  Used expired initData
  ⁠◦  Server crashed silently
2.  Hardened /verify.mjs:
  ⁠◦  Added method + content-type guards
  ⁠◦  Defensive fallback for missing initData
  ⁠◦  Wrapped Supabase logic in try/catch
  ⁠◦  Still crashed
3.  Suspected .maybeSingle() SDK issue:
  ⁠◦  Replaced with .single() and fallback
  ⁠◦  Still crashed
4.  Confirmed fresh initData from Telegram WebApp:
  ⁠◦  Verified HMAC signature
  ⁠◦  Still crashed
5.  Split .insert().select().single() into two steps:
  ⁠◦  Insert then fetch
  ⁠◦  Still crashed
6.  Renamed function to /verifyUser.mjs:
  ⁠◦  Crash resolved
  ⁠◦  Confirmed Vercel runtime cache or SDK import conflict
7.  Rewrote logic using Supabase REST API:
  ⁠◦  No SDK
  ⁠◦  Used fetch() with service role key
  ⁠◦  Stable response: { "ok": true }
  POST https://lucky-draw-1avzr4f6f-debra-ls-projects.vercel.app/api/verifyUser
  {
  "initData": "user=%7B%22id%22%3A8013482840%2C%22first_name%22%3A%22Debra%22%2C%22last_name%22%3A%22Leong%22%2C%22language_code%22%3A%22en%22%2C%22allows_write_to_pm%22%3Atrue%2C%22photo_url%22%3A%22https%3A%5C%2F%5C%2Ft.me%5C%2Fi%5C%2Fuserpic%5C%2F320%5C%2FSz6Ss3ZTGVwOVb5WupcdtF2iKa0oGeWACPpi8hGfDmoP7L8xBKTTAAyj8u2PG2Rd.svg%22%7D&chat_instance=-7933660314068559763&chat_type=private&auth_date=1759215495&signature=uEPx3eSXv0tZln8TZusRQuJRwXPzWrluM0AylrLYMKgUjkZfzMFvaGQpyYbb7l5NUZxNiVrwBN1lbkhsfnVlBA&hash=2a7890d7243e61e112fe649fa0637c6a09f1bb312599e126bcd1ceb5663a5adf"
}
{
  "ok": true,
  "user": {
    "telegram_id": 8013482840,
    "username": "debra",
    "first_name": "Debra",
    "last_name": "Leong",
    "language_code": "en"
  }
}
🔒 Notes

•  initData must be fresh (within ~24h)
•  Use Telegram WebApp window.Telegram.WebApp.initData to capture live payload
•  Supabase REST API is stable inside Vercel Functions

### ⚠️ Serverless Runtime Guard

Avoid using `window` or other browser-only globals inside `api/*.js` routes. These run in Vercel’s Node-based serverless runtime and will throw if browser-only guards are not properly scoped.

**Example:**
```js
// ❌ This will crash inside /api/profile.js
if (window.Telegram) { ... }

// ✅ Use this instead in frontend-only files
if (typeof window !== "undefined" && window.Telegram) { ... }

Impact:  
Referencing window inside /api/profile caused a silent crash, breaking the Telegram initData verification flow and returning userid = null. Once removed, the backend correctly resolved the user profile.