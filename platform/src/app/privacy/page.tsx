import { LegalShell, LegalH, LegalP } from '@/components/legal';

export const metadata = {
  title: 'Privacy Policy — IamHujju',
  description: 'How IamHujju collects, uses, and protects your personal data.',
};

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy" updated="November 21, 2026">
      <LegalP>
        This Privacy Policy explains how IamHujju (&ldquo;we&rdquo;, &ldquo;us&rdquo;, the
        &ldquo;Service&rdquo;) handles information when you create an account, chat in the
        playground, or otherwise use iamhujju.com. By using the Service you agree to this
        policy and to our <a href="/terms" className="font-semibold text-leaf-deep hover:underline dark:text-leaf">Terms &amp; Conditions</a>.
      </LegalP>

      <div>
        <LegalH>1. Information we collect</LegalH>
        <LegalP>
          <strong>Account data.</strong> Your email address, display name, hashed password, sign-in
          method (email/password or Google), and role. We never store your raw password.
          <br />
          <br />
          <strong>Usage data.</strong> The conversations and messages you send and receive, the model
          selected, token counts (input and output), request status, response latency, and timestamps.
          This powers your balance meter, history, and usage analytics.
          <br />
          <br />
          <strong>Billing data.</strong> Subscription status and payment identifiers. Payments are
          processed by Stripe; we never see or store your full card details.
          <br />
          <br />
          <strong>Security and operational data.</strong> Rate-limit events, audit logs of
          administrative actions, and error diagnostics needed to run the Service safely.
        </LegalP>
      </div>

      <div>
        <LegalH>2. How we use your information</LegalH>
        <LegalP>
          We use your data to operate the Service: deliver AI responses, meter and enforce your
          plan&rsquo;s token quota, maintain your conversation history, process payments, prevent
          abuse, and provide support. We also use aggregate, non-identifying usage statistics to
          improve the platform.
        </LegalP>
      </div>

      <div>
        <LegalH>3. Processing by AI providers</LegalH>
        <LegalP>
          When you send a message, your prompt is forwarded to the AI model provider enabled by the
          administrator for that model (for example Mistral, OpenAI, Anthropic, Groq, or our built-in
          mock provider). That provider processes the content under its own privacy policy to generate
          a response. Do not send confidential, personal, or regulated information through the
          playground if you are not comfortable with it being processed by these providers.
        </LegalP>
      </div>

      <div>
        <LegalH>4. Cookies and authentication</LegalH>
        <LegalP>
          We use two strictly necessary, HttpOnly cookies to keep you signed in: an access-token
          cookie and a refresh-token cookie (<em>iam_access</em> and <em>iam_refresh</em>). They are
          not used for advertising and are not shared with advertisers. If you sign in with Google, an
          additional short-lived state cookie protects the OAuth handshake.
        </LegalP>
      </div>

      <div>
        <LegalH>5. Data sharing</LegalH>
        <LegalP>
          We share data only as necessary to run the Service: with AI model providers (your prompts
          and the model context), with Stripe (billing), and with our hosting and database providers
          (encrypted storage and processing on our behalf). We do not sell your personal data. We may
          disclose information if required by law.
        </LegalP>
      </div>

      <div>
        <LegalH>6. Data security</LegalH>
        <LegalP>
          Passwords are hashed, refresh tokens are stored as hashes, provider API keys are encrypted
          with AES-256-GCM and never exposed to the browser, and all traffic runs over HTTPS.
          Administrative actions require role-based authorization enforced server-side.
        </LegalP>
      </div>

      <div>
        <LegalH>7. Data retention and deletion</LegalH>
        <LegalP>
          We keep your account, conversations, and usage history while your account is active. You may
          request deletion of your account and associated personal data at any time by writing to
          huzaifakazi1991@gmail.com; we will delete it, except where retention is legally required.
        </LegalP>
      </div>

      <div>
        <LegalH>8. Your rights</LegalH>
        <LegalP>
          You may request access, correction, export, or deletion of your personal data, and withdraw
          consent for optional processing. Email us at huzaifakazi1991@gmail.com and we will respond
          within a reasonable period.
        </LegalP>
      </div>

      <div>
        <LegalH>9. Children</LegalH>
        <LegalP>
          The Service is not directed at children under 13 (or the equivalent minimum age in your
          jurisdiction). We do not knowingly collect their personal data.
        </LegalP>
      </div>

      <div>
        <LegalH>10. Changes to this policy</LegalH>
        <LegalP>
          We may update this policy as the Service evolves. Material changes will be announced on the
          site. The &ldquo;Last updated&rdquo; date above shows when it was last revised.
        </LegalP>
      </div>
    </LegalShell>
  );
}
