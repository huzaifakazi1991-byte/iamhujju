import { LegalShell, LegalH, LegalP } from '@/components/legal';

export const metadata = {
  title: 'Privacy Policy — IamHujju',
  description: 'How IamHujju collects, uses, and protects your personal data.',
};

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" updated="November 21, 2026">
      <LegalP>
        This Privacy Policy explains how IamHujju, operated by the site owner and available at
        <strong> https://iamhujju.com</strong> (&ldquo;we&rdquo;, &ldquo;us&rdquo;, the
        &ldquo;Service&rdquo;), collects, uses, stores, and protects personal data when you create an
        account, sign in, chat in the AI playground, or otherwise use the Service. By using the
        Service you agree to this policy and to our{' '}
        <a href="/terms" className="font-semibold text-leaf-deep hover:underline dark:text-leaf">Terms &amp; Conditions</a>.
        For any privacy question, request, or complaint, contact us at{' '}
        <a href="mailto:huzaifakazi1991@gmail.com" className="font-semibold text-leaf-deep hover:underline dark:text-leaf">huzaifakazi1991@gmail.com</a>.
      </LegalP>

      <div>
        <LegalH>1. What data we collect</LegalH>
        <LegalP>
          <strong>a. Account data.</strong> Your email address, display name (if provided), a secure
          hash of your password (we never store the password itself), your sign-in method
          (email/password or Google), your account role, email-verification status, and account
          timestamps.
          <br />
          <br />
          <strong>b. Google account data (only if you use &ldquo;Continue with Google&rdquo;).</strong>
          {' '}When you choose Google sign-in, we request the <em>openid</em>, <em>email</em>, and{' '}
          <em>profile</em> scopes and receive your Google email address, your name as set in your
          Google profile, and a unique Google account identifier. We do not access your Google
          password, we do not read your Gmail, Drive, contacts, or any other Google service, and we
          never post on your behalf.
          <br />
          <br />
          <strong>c. Usage data.</strong> The conversations and messages you send and receive, the AI
          model selected, token counts (input and output), request status (completed, partial, failed,
          or blocked), response latency, and timestamps. This data powers your live token balance,
          your conversation history, and your usage page.
          <br />
          <br />
          <strong>d. Billing data.</strong> Subscription status, plan identifiers, and payment
          references. All card details and payment processing are handled by Stripe; we never receive
          or store your full card number.
          <br />
          <br />
          <strong>e. Security and operational data.</strong> Rate-limit events, hashed API-key
          records you create for programmatic access, audit logs of administrative actions, and
          technical error diagnostics required to run the Service safely.
        </LegalP>
      </div>

      <div>
        <LegalH>2. How we use your data</LegalH>
        <LegalP>
          We use personal data only to operate and secure the Service: to create and authenticate your
          account and keep you signed in; to deliver AI responses through the gateway; to meter token
          usage and enforce the daily and monthly quotas of your plan; to maintain your conversation
          history; to process payments and manage subscriptions; to detect and prevent abuse, fraud,
          and automated attacks; and to provide customer support. We also use aggregated, de-identified
          statistics to understand usage patterns and improve the platform. <strong>We do not sell
          your personal data and we do not use it for advertising.</strong>
        </LegalP>
      </div>

      <div>
        <LegalH>3. Sharing with third parties</LegalH>
        <LegalP>
          We share data only as strictly necessary to run the Service, with these categories of
          providers: <strong>Google</strong> (sign-in authentication, via OAuth); <strong>AI model
          providers</strong> enabled by the administrator, such as Mistral, OpenAI, Anthropic, or
          Groq (your prompts and recent conversation context are transmitted so a model can respond);
          <strong> Stripe</strong> (payment processing); and <strong>hosting and database
          providers</strong>, such as Render and Neon, that store and process data strictly on our
          behalf. Each provider processes data under its own terms and privacy policy. We may also
          disclose information where required by law, regulation, or valid legal process.
        </LegalP>
      </div>

      <div>
        <LegalH>4. Cookies we use</LegalH>
        <LegalP>
          We use only strictly necessary cookies: <em>iam_access</em>, a short-lived HttpOnly
          access-token cookie that keeps you signed in; <em>iam_refresh</em>, an HttpOnly
          refresh-token cookie scoped to authentication paths; and, during a Google sign-in, a
          short-lived <em>oauth_state</em> cookie that protects the OAuth exchange against
          cross-site-request forgery. These cookies are never used for advertising, tracking, or
          analytics cross-site profiles, and they are not shared with third parties for marketing.
        </LegalP>
      </div>

      <div>
        <LegalH>5. How long we keep your data</LegalH>
        <LegalP>
          Account, conversation, and usage data are retained while your account is active. When you
          request account deletion, we delete your profile, conversations, and token records within
          30 days, except where longer retention is legally required (for example billing records,
          which Stripe retains under its own compliance rules). Security and audit logs are kept for
          up to 90 days. Anonymous, aggregated statistics may be retained indefinitely.
        </LegalP>
      </div>

      <div>
        <LegalH>6. How we protect your data</LegalH>
        <LegalP>
          Passwords and refresh tokens are stored only as irreversible hashes. Provider API keys are
          encrypted at rest with AES-256-GCM and are never exposed to the browser. All traffic runs
          over HTTPS. Access to user data is restricted by role-based authorization enforced
          server-side on every request, and all database writes for balances and payments are
          transactional.
        </LegalP>
      </div>

      <div>
        <LegalH>7. Your rights and choices</LegalH>
        <LegalP>
          Whatever your country of residence, you may ask us to: give you a copy of the personal data
          we hold about you; correct inaccurate data; delete your account and associated personal
          data; export your data in a portable format; or tell you what data we share with third
          parties. Email us at huzaifakazi1991@gmail.com and we will respond within 30 days. You can
          also sign out at any time (which clears your session cookies), and you can revoke
          IamHujju&rsquo;s access to your Google account at{' '}
          <a href="https://myaccount.google.com/permissions" className="font-semibold text-leaf-deep hover:underline dark:text-leaf" rel="noopener noreferrer" target="_blank">myaccount.google.com/permissions</a>.
        </LegalP>
      </div>

      <div>
        <LegalH>8. Children&rsquo;s privacy</LegalH>
        <LegalP>
          The Service is not directed at children under 13 (or the equivalent minimum digital-consent
          age in your jurisdiction), and we do not knowingly collect their personal data. If you
          believe a child has created an account, contact us and we will remove it.
        </LegalP>
      </div>

      <div>
        <LegalH>9. International data transfers</LegalH>
        <LegalP>
          Our hosting and database providers may process data in countries other than yours,
          including the United States. Where required, we rely on the safeguards those providers
          implement (such as standard contractual clauses) to protect data transferred across
          borders.
        </LegalP>
      </div>

      <div>
        <LegalH>10. Changes to this policy</LegalH>
        <LegalP>
          We may update this policy as the Service evolves. We will publish any material change on
          this page with a new &ldquo;Last updated&rdquo; date, and, for significant changes affecting
          signed-in users, announce it in the Service. The date above always shows the current
          version.
        </LegalP>
      </div>
    </LegalShell>
  );
}
