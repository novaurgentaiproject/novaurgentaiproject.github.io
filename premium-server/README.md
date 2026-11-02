# Nova Premium (Stripe)

**Nova 3 Martia** is a Premium model. Everyone can use the other five Nova models for free; Martia needs **Nova Premium**.

There are two ways to unlock Premium:

- **Buy it.** People pay through a [Stripe Payment Link](https://docs.stripe.com/payment-links). The small **Nova premium server** in this folder (a free Cloudflare Worker) confirms each purchase with Stripe.
- **Use a Premium code.** You can hand out codes to yourself, friends or testers. Some codes work with no server at all.

Until the premium server is set up, nobody can buy Premium; Nova shows "Premium sign-ups aren't open yet" and Premium codes still work.

## How buying works

1. Someone taps **Upgrade** in Nova. Nova opens your Stripe Payment Link.
2. They pay on Stripe's checkout page. Nova never sees card details.
3. Stripe sends them back to Nova at `?premium={CHECKOUT_SESSION_ID}`.
4. Nova asks the premium server about that checkout. The server asks Stripe whether it was paid and, for a subscription, whether it's still active.
5. Martia unlocks. The checkout ID becomes their **Premium key**. Nova shows it so they can unlock Premium on their other devices, and in Nova on their Home Screen, which keeps its own storage on iPhone and iPad.

Nova re-checks memberships with the server every 6 hours. If a subscription is canceled, it stays active until the end of the paid period, then Martia locks again. If Nova can't reach the server (for example, no internet), Premium keeps working for up to 7 days.

## 1. Create the Payment Link in Stripe

Try everything in **test mode** first (the "Test mode" switch in the Stripe Dashboard), then repeat the steps in live mode.

1. Sign in at [dashboard.stripe.com](https://dashboard.stripe.com) and open **Payment Links**, then **Create payment link** (or **+ New**).
2. Add a product called **Nova Premium** and set your price. Choose **Recurring** (for example monthly) for a subscription, or **One time** for lifetime Premium.
3. Open the **After payment** tab and choose **Don't show confirmation page**. Redirect customers to:

   ```
   https://novaurgentaiproject.github.io/?premium={CHECKOUT_SESSION_ID}
   ```

   Type `{CHECKOUT_SESSION_ID}` exactly like that. Stripe replaces it with the checkout's ID.
4. Create the link and copy its address. It looks like `https://buy.stripe.com/…`.
5. So members can cancel or change their card, turn on the customer portal: **Settings → Billing → Customer portal**, then save it. Nova's **Manage subscription** button opens this page.

## 2. Create a Stripe API key for the server

Use a **restricted key** so the server can only do what it needs. In Stripe, go to **Developers → API keys → Create restricted key** and allow:

| Resource | Access | Why |
|---|---|---|
| Checkout Sessions | Read | Confirm purchases |
| Subscriptions | Read | Check that subscriptions are still active |
| Payment Links | Read | Find your link, its price and checkout address |
| Prices, Products | Read | Show the price on Nova's Upgrade screen |
| PaymentIntents, Charges | Read | Optional: lock Premium again if a one-time purchase is refunded |
| Customer portal | Write | The **Manage subscription** button |

If a permission is missing, the server's health page says which one.

## 3. Deploy the premium server

### Option A: in the Cloudflare dashboard (no tools needed)

1. In [dash.cloudflare.com](https://dash.cloudflare.com), go to **Workers & Pages → Create → Create Worker**. Name it `nova-premium` and click **Deploy**.
2. Click **Edit code**, replace everything with the contents of [`worker.js`](worker.js), and click **Deploy**.
3. In the Worker, open **Settings → Variables and Secrets** and add:
   - `STRIPE_SECRET_KEY`, type **Secret**: your restricted key (`rk_live_…` or, while testing, `rk_test_…`).
   - `STRIPE_PAYMENT_LINK`, type **Text**: the Payment Link address from step 1 (`https://buy.stripe.com/…`) or its ID (`plink_…`). Only purchases made through this link unlock Premium.
   - `PREMIUM_CODES`, type **Secret** (optional): gift codes, separated by commas. See [Premium codes](#premium-codes).
4. Deploy again.

### Option B: with Wrangler

```bash
cd premium-server
# put your Payment Link address in wrangler.toml (STRIPE_PAYMENT_LINK), then:
npx wrangler deploy
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put PREMIUM_CODES    # optional
```

### Check that it's running

Open the Worker's address (`https://nova-premium.your-name.workers.dev`) in a browser. When everything is set up you'll see:

```json
{"service":"nova-premium","ok":true,"stripe":true,"mode":"live","paymentLink":true,"codes":0,"originAllowed":true,"problems":[]}
```

If `ok` is `false`, `problems` lists what to fix, such as a missing key, a link it can't find, or a missing redirect.

## 4. Connect Nova

Put the Worker's address in `PREMIUM_SERVER` near the top of [`js/premium.js`](../js/premium.js) and push the change:

```js
export const PREMIUM_SERVER = 'https://nova-premium.your-name.workers.dev';
```

Then open Nova, tap **Upgrade**, and you should see your price. To test in Stripe's test mode, pay with card number `4242 4242 4242 4242`, any future date and any CVC.

## Premium codes

**Server codes** (`PREMIUM_CODES` on the Worker) are private: they never appear in the website's code. Delete a code from the list to switch it off; Nova notices at its next check (within 6 hours). Codes ignore case, spaces and dashes, and must have at least 6 letters or digits.

**Offline codes** work even without the premium server. Nova's code holds only their SHA-256 hashes (in `OFFLINE_CODES` in [`js/premium.js`](../js/premium.js)), so they can't be read from the public repository. To add one, choose a long random code, then hash it in upper case with everything except letters and digits removed:

```bash
printf '%s' 'NOVA-ABCD-EFGH-JKLM-NPQR' | tr '[:lower:]' '[:upper:]' | tr -cd 'A-Z0-9' | shasum -a 256
```

Add the hash to `OFFLINE_CODES`. Delete a hash to switch that code off.

People enter codes in Nova's Upgrade screen (**Have a Premium code or key?**) or in **Settings → Premium**.

## Settings reference

| Variable | Required | What it does |
|---|---|---|
| `STRIPE_SECRET_KEY` (secret) | For payments | Stripe restricted key (or secret key) used to confirm purchases. |
| `STRIPE_PAYMENT_LINK` | For payments | The Payment Link people buy Premium with: `plink_…` or `https://buy.stripe.com/…`. |
| `PREMIUM_CODES` (secret) | No | Comma-separated gift codes that unlock Premium. |
| `ALLOWED_ORIGINS` | No | Comma-separated sites allowed to use the server. Defaults to `https://novaurgentaiproject.github.io` plus localhost. |

## Good to know

- **The lock runs in the browser.** Nova is a static website: its code is public and runs on each visitor's device. The Premium lock stops normal visitors from using Martia without paying, but someone who edits the page's code in their browser could get around it. Making that impossible needs the AI requests themselves to go through a server you control (for example with your own Claude API key), which also means paying for those requests yourself.
- **Premium keys are like passwords.** Anyone with a buyer's key can use that membership. Nova asks people to keep it private.
- **Never put your Stripe key in this repository.** GitHub Pages sites are public. Keep it only in the Worker's secrets.
- Optionally, add a rate-limiting rule for the Worker in Cloudflare to slow down anyone guessing codes.
