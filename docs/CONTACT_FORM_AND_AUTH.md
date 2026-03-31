# Contact form, email, and signup/login

## Where to collect contact form submissions

Right now the Contact Us form only runs in the browser (client-side). To **collect** what users type you need one of:

1. **Backend API** – Add an endpoint (e.g. `POST /api/contact`) that receives the form data and either:
   - Saves it to a database (e.g. MongoDB, PostgreSQL), or
   - Sends an email to you (e.g. with Nodemailer, SendGrid, or your host’s email API).

2. **Third‑party form service** – Use a provider that gives you a form endpoint and stores submissions (and optionally emails you):
   - [Formspree](https://formspree.io) – send the form to their URL, they email you and/or show submissions in a dashboard.
   - [Netlify Forms](https://docs.netlify.com/forms/setup/) or [Vercel + serverless](https://vercel.com/docs/functions) – if you deploy there, you can add a serverless function that saves to a DB or sends email.

3. **Email only (no backend)** – Use a `mailto:` link instead of a real form. The user’s email client opens with your address (e.g. `info@gorythm.com`) as recipient. You don’t get a structured “inbox” of form data; you get emails when users submit.

**To wire the current form:** in `ContactPage.jsx`, in `handleSubmit`, replace the `setSubmitted(true)` part with a `fetch()` call to your API or Formspree URL, and then show success/error based on the response.

---

## “info@gorythm.com” and getting user emails

- **Displaying `info@gorythm.com`** – The contact page already shows this in the “Contact us” section and uses it in a `mailto:` link. It’s set in `src/config/constants.js` as `INFO_EMAIL`. You receive mail at that address when someone clicks the link and sends from their own email client.

- **Getting the *user’s* email from the form** – When a user submits the **form**, their email is in the field `form.email` in `handleSubmit`. To “get” it you must **send** that data somewhere:
  - If you use a **backend**: your API receives the body (name, email, phone, subject, message) and can save it to a database or forward it to `info@gorythm.com` (e.g. “New contact from: user@example.com”).
  - If you use **Formspree** (or similar): they email you each submission; the user’s email is in that email.
  - So: **you collect user emails by storing or emailing the form submission**; the address `info@gorythm.com` is where *you* receive those notifications, not where the user’s email is “stored” unless you save it in your own system.

---

## How signup and login usually work on websites

- **Signup (registration)**  
  - User fills a form (email, password, maybe name).  
  - The frontend sends this to your backend (e.g. `POST /api/auth/register`).  
  - The backend checks the email isn’t already used, hashes the password (e.g. bcrypt), and stores the user in a database.  
  - You often then send a verification email or redirect to login.

- **Login**  
  - User enters email and password.  
  - Frontend sends them to the backend (e.g. `POST /api/auth/login`).  
  - Backend finds the user, checks the password hash, and if correct creates a **session** or returns a **token** (e.g. JWT).  
  - The frontend stores the token (e.g. in memory or in a cookie) and sends it with later requests.  
  - Protected routes or API endpoints check that token to know who is logged in.

So: **signup = create account and store it; login = verify credentials and give the user a session/token.** Buttons “Sign up” and “Login” typically link to these flows (separate pages or modals) that call your auth API.
