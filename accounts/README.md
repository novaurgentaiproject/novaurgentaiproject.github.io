# Nova accounts (Firebase)

Nova accounts let people **log in with Google, Apple, or an email and password**. Once logged in, Nova keeps these the same on every device they use:

- chats
- memory
- custom agents
- personalization (name, about you, style, personality)
- Nova Premium

API keys (Claude, Fish Audio) and device settings such as theme and voice never leave the device. Nova still works without an account; everything then stays on that device.

Accounts run on [Firebase](https://firebase.google.com): Firebase Authentication for logging in, and Cloud Firestore to store each account's data. The free Spark plan is enough for a small community.

Until Firebase is connected, Nova's **Log in** screen says accounts are coming soon.

## 1. Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and click **Create a project** (Google Analytics isn't needed).
2. In the project, open **Project settings** (the gear) → **General** → **Your apps**, and click the **Web** icon (`</>`). Name it `Nova`, leave Firebase Hosting unticked, and click **Register app**.
3. Copy the `firebaseConfig` values it shows: `apiKey`, `authDomain`, `projectId` and `appId`.

## 2. Turn on the ways to log in

In **Build → Authentication → Get started → Sign-in method**:

- **Email/Password:** enable the first switch (not "Email link") and save.
- **Google:** enable it, choose a support email and save.
- **Apple:** needs a paid [Apple Developer Program](https://developer.apple.com/programs/) membership. In your Apple Developer account:
  1. Create an **App ID** with **Sign in with Apple** turned on.
  2. Create a **Services ID** (for example `io.github.novaurgentaiproject.signin`). Turn on **Sign in with Apple** for it, and set:
     - Domain: `YOUR-PROJECT-ID.firebaseapp.com`
     - Return URL: `https://YOUR-PROJECT-ID.firebaseapp.com/__/auth/handler`
  3. Create a **Key** with **Sign in with Apple** turned on, and download it.
  4. Back in Firebase, enable **Apple** and enter the Services ID, your Apple Team ID, the Key ID and the private key.

  Nova hides the Apple button until you add `'apple'` to `SIGN_IN_METHODS` in [`js/account.js`](../js/account.js). Do that once Apple is turned on in Firebase.

Then, in **Authentication → Settings → Authorized domains**, click **Add domain** and add `novaurgentaiproject.github.io`.

## 3. Create the database

1. Open **Build → Firestore Database → Create database**. Pick a location near your users and choose **production mode**.
2. Open the **Rules** tab, replace everything with the contents of [`firestore.rules`](firestore.rules), and click **Publish**.

The rules let each person read and write only their own data.

## 4. Connect Nova

Put your config into `FIREBASE_CONFIG` near the top of [`js/account.js`](../js/account.js) and push the change:

```js
export const FIREBASE_CONFIG = {
  apiKey: 'AIza…',
  authDomain: 'your-project-id.firebaseapp.com',
  projectId: 'your-project-id',
  appId: '1:…:web:…',
};
```

### Show Nova's address in the Google sign-in window (optional)

By default, Google's sign-in window says "continue to YOUR-PROJECT-ID.firebaseapp.com". Nova hosts Firebase's sign-in helper pages itself (in [`__/auth/`](../__/auth) and [`__/firebase/init.json`](../__/firebase/init.json)), so it can use its own address instead. This is Firebase's "self-host the helper code" setup. It also helps Safari, which blocks some cross-site storage that sign-in otherwise relies on:

1. Set `authDomain` in `FIREBASE_CONFIG` (and in `__/firebase/init.json`) to `novaurgentaiproject.github.io`.
2. In the [Google Cloud console](https://console.cloud.google.com/apis/credentials), pick your Firebase project and open the OAuth client called **Web client (auto created by Google Service)**. Under **Authorized redirect URIs**, add `https://novaurgentaiproject.github.io/__/auth/handler` and click **Save**. Until you do, Google sign-in shows "Error 400: redirect_uri_mismatch".

Firebase updates the helper now and then. To refresh it, download these files from `https://YOUR-PROJECT-ID.firebaseapp.com/__/auth/` and replace the copies in `__/auth/`: `handler` (save as `handler.html`), `handler.js`, `experiments.js`, `iframe` (save as `iframe.html`) and `iframe.js`.

**Sign in with Apple doesn't work with this setup:** Apple sends its answer as a form post, which a GitHub Pages site can't receive. To add Apple, set `authDomain` back to `YOUR-PROJECT-ID.firebaseapp.com` (in both places) first.

### About these values

These values aren't secret. They only identify your Firebase project; the security rules are what protect people's data. For extra safety, restrict the API key to your site in the [Google Cloud console](https://console.cloud.google.com/apis/credentials). Edit the "Browser key", choose **Websites** and add `https://novaurgentaiproject.github.io/*`.

Open Nova, tap **Sign up**, and create an account to try it.

## How it works

- **Logging in on a new device** downloads the account's chats and data. Anything already on the device is added to the account.
- **Changes sync** a couple of seconds after they happen, and Nova checks for changes from other devices when it opens, when you come back to it, and every 2 minutes. If two devices change the same chat, the most recent change wins.
- **Logging out** removes the account's chats, memory, agents and Premium from that device. They stay safe in the account. If some changes haven't been saved to the account yet (for example, while offline), Nova asks before logging out.
- **Deleting an account** asks the person to confirm with their password, Google or Apple. It then deletes everything stored for the account, and the account itself.
- **Premium:** when accounts are on, Nova asks people to log in before buying Premium. Their email is pre-filled at checkout and their Premium is saved to their account, so it unlocks on all their devices, including Nova on their Home Screen. Deleting an account doesn't cancel a Stripe subscription; Nova reminds people to cancel first.

## Good to know

- **Google and Apple open a pop-up window.** In Nova added to the Home Screen on iPhone and iPad, iOS often blocks these pop-ups. Nova then suggests logging in with email, which works everywhere.
- **Very large chats don't sync.** Each chat is compressed, and must be under about 900 KB. Big images and files inside chats aren't uploaded (the conversation text is). **Settings → Account** shows if a chat is too big to sync.
- **Emails** (confirming an address and resetting a password) come from `noreply@YOUR-PROJECT-ID.firebaseapp.com`. Change their wording under **Authentication → Templates**.
- **Free plan limits:** the Spark plan allows 50,000 reads and 20,000 writes a day and 1 GiB of storage. Nova only reads what changed since the last sync, so this goes a long way.
