# Nova Premium (Stripe + Claude)

**Nova 3 Martia** is a Premium model. Everyone can use the other five Nova models for free; Martia needs **Nova Premium**.

Premium members chat with Martia and talk with **James** **without any API keys of their own**. The small **Nova premium server** in this folder (a Cloudflare Worker):

- **sells memberships.** People pay through a [Stripe Payment Link](https://docs.stripe.com/payment-links), and the server confirms each purchase with Stripe.
- **answers members' Martia chats** with your Claude API key, on Claude Opus 5.5.
- **gives members James's voice** with your Fish Audio API key: Nova speaks in James's voice and hears them through Fish Audio, on every device (including iPhone and iPad, where the browser's own speech recognition is unreliable).

Each member gets a monthly allowance that covers both, so no one can cost you more than they pay. Free users keep their device's built-in voice.

You can also hand out **Premium codes** to yourself, friends or testers.

Until the premium server is set up, nobody can buy Premium. Nova shows "Premium sign-ups aren't open yet", and Premium codes still work.

## The money

With the price at **$9.99 a month**:

| | Per member, per month |
|---|---|
| Member pays | $9.99 |
| Stripe's fee (2.9% + 30¢ for US cards; varies by country) | about −$0.59 |
| Most their Martia chats and James's voice can cost you (`MONTHLY_AI_BUDGET`) | up to −$4.70 |
| **You keep** | **at least about $4.70**, more when members use less |

- **What a Martia reply costs:** Claude Opus 5.5 is $4 per million input tokens and $20 per million output tokens. A typical reply costs about 3–6¢, so $4.70 covers roughly 80–150 replies a month. Long conversations, attachments and long answers cost more.
- **What James costs:** Fish Audio charges $15 per million bytes of text spoken (about 1¢ for a 600-character reply) and $0.36 per hour of listening (about 0.1¢ for a 10-second question). A voice conversation mostly costs what its Martia replies cost.
- **Cloudflare:** the free plan is enough to start. If very long answers start failing with a "Worker exceeded CPU time" error, switch to Workers Paid ($5 a month).
- **Taxes:** depending on where you and your members live, you may owe sales tax or VAT on memberships. [Stripe Tax](https://stripe.com/tax) can work it out.

## Before you start

- **A Stripe account** ([stripe.com](https://stripe.com)). Stripe asks for your identity and a bank account before it pays you. The account holder must be at least 18; a parent or guardian can open it otherwise.
- **A Claude Console account** with billing set up ([console.anthropic.com](https://console.anthropic.com)). This is what pays for members' Martia chats.
- **A Fish Audio account** with API credit ([fish.audio](https://fish.audio)). This is what pays for James's voice.
- **A Cloudflare account** (free, [dash.cloudflare.com](https://dash.cloudflare.com)).
- **A terms page.** Stripe expects your site to show what you sell, its price, how to contact you, and your refund and cancellation policy.

## How buying works

1. Someone taps **Upgrade** in Nova. With accounts on, Nova asks them to log in or sign up first, then opens your Stripe Payment Link.
2. They pay on Stripe's checkout page. Nova never sees card details.
3. Stripe sends them back to Nova at `?premium={CHECKOUT_SESSION_ID}`.
4. Nova asks the premium server about that checkout. The server asks Stripe whether it was paid and, for a subscription, whether it's still active.
5. Martia unlocks. The checkout ID becomes their **Premium key**. It's saved to their account, so Premium follows them to their other devices.

Nova re-checks memberships every 6 hours, and the server checks again at least every 10 minutes while a member is chatting with Martia. If a subscription is canceled, it stays active until the end of the paid period, then Martia locks again.

## 1. Create the Payment Link in Stripe

Try everything in **test mode** first (the "Test mode" switch in the Stripe Dashboard), then repeat the steps in live mode.

1. Sign in at [dashboard.stripe.com](https://dashboard.stripe.com) and open **Payment Links**, then **Create payment link** (or **+ New**).
2. Add a product called **Nova Premium**, priced at **$9.99**, **Recurring**, **Monthly**.
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

## 3. Create a Claude API key

1. At [console.anthropic.com](https://console.anthropic.com), open **Settings → Billing** and add credits. Turning on auto-reload keeps Martia working when credits run low.
2. Open **Settings → Limits** and set a **monthly spend limit** a little above what you expect. It's a safety net in case something goes wrong.
3. Open **API keys → Create key**, name it `Nova premium server`, and copy it. You'll only see it once.

## 3b. Create a Fish Audio API key

1. At [fish.audio](https://fish.audio), open **API** billing and add credit. (If it runs out, the server switches James to Fish Audio's free model, which may sound different or be slower.)
2. Open **API keys** ([fish.audio/app/api-keys](https://fish.audio/app/api-keys)), create a key named `Nova premium server`, and copy it.

## 4. Deploy the premium server

The server uses the Claude SDK, so Cloudflare builds it from this folder. Pick one way:

### Option A: from GitHub, in the Cloudflare dashboard (works on an iPad)

1. In [dash.cloudflare.com](https://dash.cloudflare.com), go to **Workers & Pages → Create → Import a repository**, and connect your GitHub account if asked.
2. Choose this repository. Set:
   - **Project name:** `nova-premium`
   - **Build command:** `npm install`
   - **Deploy command:** `npx wrangler deploy`
   - **Path** (under **Advanced settings**, sometimes called the root directory): `premium-server`
3. Click **Deploy**. Cloudflare redeploys automatically whenever this folder changes on GitHub.

### Option B: with Wrangler, on a computer

```bash
cd premium-server
npm install
npx wrangler deploy
```

### Option C: ask Claude Code to do it

Create a Cloudflare API token with the **Edit Cloudflare Workers** template (**My Profile → API Tokens → Create Token**), and give it to Claude Code through its secure credential form when asked. Don't paste the token into a chat.

## 5. Add the server's settings

In the Worker, open **Settings → Variables and Secrets**, add these, then deploy again (or click **Deploy** on the latest version):

- `STRIPE_SECRET_KEY`, type **Secret**: your restricted key (`rk_live_…` or, while testing, `rk_test_…`).
- `ANTHROPIC_API_KEY`, type **Secret**: your Claude API key.
- `FISH_API_KEY`, type **Secret**: your Fish Audio API key.
- `STRIPE_PAYMENT_LINK`, type **Text**: the Payment Link address from step 1 (`https://buy.stripe.com/…`) or its ID (`plink_…`). Only purchases made through this link unlock Premium.
- `MONTHLY_AI_BUDGET`, type **Text** (optional): each member's monthly allowance for Martia and James, in US dollars. Defaults to `4.70`.
- `PREMIUM_CODES`, type **Secret** (optional): gift codes, separated by commas. See [Premium codes](#premium-codes).

### Check that it's running

Open the Worker's address (`https://nova-premium.your-name.workers.dev`) in a browser. When everything is set up you'll see:

```json
{"service":"nova-premium","ok":true,"stripe":true,"mode":"live","paymentLink":true,"martia":{"included":true,"model":"claude-opus-5-5","monthlyBudget":4.7},"voice":{"included":true,"name":"James"},"codes":0,"originAllowed":true,"problems":[]}
```

If `ok` is `false`, `problems` lists what to fix, such as a missing key, a link it can't find, or a missing redirect.

## 6. Connect Nova

Put the Worker's address in `PREMIUM_SERVER` near the top of [`js/premium.js`](../js/premium.js) and push the change:

```js
export const PREMIUM_SERVER = 'https://nova-premium.your-name.workers.dev';
```

Then open Nova and tap **Upgrade**. You should see your price, "No API key needed" and "Talk with James". To test in Stripe's test mode, pay with card number `4242 4242 4242 4242`, any future date and any CVC. Martia's replies use real Claude credits even in Stripe's test mode.

## How the allowance works

- **One allowance covers both** Martia's replies and James's voice. Members see it in **Settings → Premium** ("Premium allowance this month: 12% used · refills on Dec 3").
- **It refills** on each member's billing date. Gift codes and one-time purchases refill on the 1st of each month. A gift code's allowance is shared by everyone who uses that code.
- **Before each reply**, the server counts the conversation's tokens (free) and holds the most the reply could cost. When the reply finishes, it charges what Claude actually billed and releases the rest. That way a member can never go over, even with replies running on two devices at once. Near the end of the allowance, replies get a lower length limit so they fit.
- **Limits per reply:** up to 20,000 output tokens, and conversations up to 100,000 input tokens. Members are asked to start a new chat after that.
- **Stopped replies:** if a member stops a reply, the server cancels it at Claude and charges an estimate of what was generated.
- **Refusal fallbacks:** if Claude's safety checks decline a request, Claude may finish it on a fallback model. The server charges each model's own price.
- **James's voice** is charged exactly: each spoken clip by the bytes of its text, each recording by its length in seconds. Failed requests cost nothing.
- **When it runs out,** Martia explains when it refills, and suggests switching to a free model or connecting their own Claude key in **Settings → Engine**. If they've connected their own key, Nova uses it automatically. Voice mode switches to the device's own voice and speech recognition until the allowance refills.
- **Privacy:** the server passes members' Martia conversations to Claude, and what James says plus members' voice recordings to Fish Audio. It keeps only each member's usage total for the month, not their chats or recordings.

## Premium codes

**Server codes** (`PREMIUM_CODES` on the Worker) are private: they never appear in the website's code. Delete a code from the list to switch it off; Nova notices at its next check (within 6 hours). Codes ignore case, spaces and dashes, and must have at least 6 letters or digits. Server codes include Martia with the monthly allowance.

**Offline codes** work even without the premium server. Nova's code holds only their SHA-256 hashes (in `OFFLINE_CODES` in [`js/premium.js`](../js/premium.js)), so they can't be read from the public repository. They unlock Martia in the browser only, so whoever uses one needs their own Claude key for full answers. To add one, choose a long random code, then hash it in upper case with everything except letters and digits removed:

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
| `ANTHROPIC_API_KEY` (secret) | For included Martia | Your Claude API key. Members' Martia chats are billed to it. |
| `FISH_API_KEY` (secret) | For included voice | Your Fish Audio API key. Members' James voice (speaking and listening) is billed to it. |
| `MONTHLY_AI_BUDGET` | No | Each member's monthly allowance for Martia and James, in US dollars. Default `4.70`. |
| `PREMIUM_CODES` (secret) | No | Comma-separated gift codes that unlock Premium. |
| `ALLOWED_ORIGINS` | No | Comma-separated sites allowed to use the server. Defaults to `https://novaurgentaiproject.github.io` plus localhost. |

The `USAGE` Durable Object (members' allowances) is set up by [`wrangler.toml`](wrangler.toml).

## Good to know

- **Martia's answers are protected by the server.** Nova is a static website, so the Premium lock on the Martia menu runs in the browser, and someone who edits the page could get past it. They still couldn't get Martia's included answers: the server checks the membership on every message.
- **Premium keys are like passwords.** Anyone with a member's key can use their membership and allowance. Nova asks people to keep it private.
- **Never put your Stripe or Claude key in this repository.** GitHub Pages sites are public. Keep them only in the Worker's secrets.
- **Refunds and cancellations** happen in the Stripe Dashboard (or by members through **Manage subscription**). A refunded or canceled membership locks Martia again at the server's next check.
- Optionally, add a rate-limiting rule for the Worker in Cloudflare to slow down anyone guessing codes.
