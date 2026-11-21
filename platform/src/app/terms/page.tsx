import { LegalShell, LegalH, LegalP } from '@/components/legal';

export const metadata = {
  title: 'Terms & Conditions — IamHujju',
  description: 'The terms governing your use of the IamHujju AI platform.',
};

export default function TermsPage() {
  return (
    <LegalShell title="Terms & Conditions" updated="November 21, 2026">
      <LegalP>
        These Terms &amp; Conditions (&ldquo;Terms&rdquo;) govern your access to and use of
        IamHujju at iamhujju.com (the &ldquo;Service&rdquo;), an AI platform operated by the site
        owner. By creating an account or using the Service you accept these Terms and our{' '}
        <a href="/privacy" className="font-semibold text-leaf-deep hover:underline dark:text-leaf">Privacy Policy</a>.
        If you do not agree, do not use the Service.
      </LegalP>

      <div>
        <LegalH>1. Accounts</LegalH>
        <LegalP>
          You must provide a valid email address (or sign in through Google) and are responsible for
          keeping your credentials secure and for all activity under your account. You must be at
          least 13 years old, or the minimum digital-consent age in your country. Notify us
          immediately of any unauthorized use.
        </LegalP>
      </div>

      <div>
        <LegalH>2. Plans, tokens and fair use</LegalH>
        <LegalP>
          Free-tier accounts receive a daily token grant and are subject to model availability and
          rate limits. Paid plans (subscriptions processed via Stripe) unlock larger quotas and
          additional models as described on the pricing page. Token balances, grants, and usage
          metering are maintained server-side and are final. Quotas may not be circumvented through
          multiple or automated accounts.
        </LegalP>
      </div>

      <div>
        <LegalH>3. Acceptable use</LegalH>
        <LegalP>
          You agree not to: violate any law or third-party right; generate or distribute unlawful,
          harmful, deceptive, hateful, sexually exploitative, or infringing content; probe or disrupt
          the Service or its infrastructure; reverse engineer providers&rsquo; models; resell
          unlimited-access outputs through programmatic abuse; or misuse API keys issued to you. We
          may rate-limit, suspend, or terminate accounts that breach these rules.
        </LegalP>
      </div>

      <div>
        <LegalH>4. AI-generated content</LegalH>
        <LegalP>
          Responses are produced by third-party AI models and may be inaccurate, incomplete, or
          outdated. AI output is not professional advice (legal, medical, financial, or otherwise)
          and must not be relied upon without independent verification. You are responsible for how
          you use the output. Where legally required, you must clearly disclose AI-generated content
          when you publish it.
        </LegalP>
      </div>

      <div>
        <LegalH>5. Payments and billing</LegalH>
        <LegalP>
          Paid features require an active subscription processed by Stripe. Fees are stated on the
          pricing page and charged for each billing period; renewal continues until cancelled.
          Cancellation takes effect at the end of the current period. Refund handling for one-time
          purchases is at our discretion except where consumer law provides otherwise. Unused tokens
          generally do not roll over unless a plan states otherwise.
        </LegalP>
      </div>

      <div>
        <LegalH>6. Availability and changes</LegalH>
        <LegalP>
          We aim for high availability but the Service is provided on a best-effort basis. Model
          availability depends on provider capacity, and free instances may pause briefly after idle
          periods. We may add, change, or discontinue features, models, and plans; material changes to
          paid plans will be communicated in advance.
        </LegalP>
      </div>

      <div>
        <LegalH>7. Suspension and termination</LegalH>
        <LegalP>
          We may suspend or terminate an account for breach of these Terms, payment failure, or
          security risk. You may stop using the Service at any time. Upon termination, your right to
          use the Service ends; sections that by their nature should survive (payment obligations,
          disclaimers, liability limits) do so.
        </LegalP>
      </div>

      <div>
        <LegalH>8. Intellectual property</LegalH>
        <LegalP>
          The Service&rsquo;s software, design, brand, and content are owned by the operator or
          licensed to it. You retain rights to the content you submit and receive a limited,
          non-exclusive licence to use the AI output generated for you, subject to these Terms and
          applicable law.
        </LegalP>
      </div>

      <div>
        <LegalH>9. Disclaimers and limitation of liability</LegalH>
        <LegalP>
          THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT
          WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE
          OPERATOR SHALL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE
          DAMAGES, OR FOR LOST DATA, LOST PROFITS, OR BUSINESS INTERRUPTION ARISING FROM YOUR USE OF
          THE SERVICE. OUR AGGREGATE LIABILITY FOR DIRECT DAMAGES SHALL NOT EXCEED THE FEES YOU PAID
          TO US IN THE TWELVE MONTHS PRECEDING THE CLAIM. NOTHING IN THESE TERMS LIMITS LIABILITY
          THAT CANNOT BE LIMITED UNDER APPLICABLE LAW.
        </LegalP>
      </div>

      <div>
        <LegalH>10. Governing law</LegalH>
        <LegalP>
          These Terms are governed by the laws of India, without regard to conflict-of-law rules.
          Courts in the operator&rsquo;s jurisdiction shall have exclusive subject-matter
          jurisdiction, except where mandatory local consumer protection law grants you the right to
          bring proceedings elsewhere.
        </LegalP>
      </div>

      <div>
        <LegalH>11. Contact and changes</LegalH>
        <LegalP>
          We may update these Terms; the &ldquo;Last updated&rdquo; date reflects the current
          version, and continued use after changes means you accept them. Questions or notices:
          huzaifakazi1991@gmail.com.
        </LegalP>
      </div>
    </LegalShell>
  );
}
