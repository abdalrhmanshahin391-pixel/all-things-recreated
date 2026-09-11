import * as React from 'react'
import { createAuthEmailHandler } from '@lovable.dev/email-js'
import { createFileRoute } from '@tanstack/react-router'
import { SignupEmail } from '@/lib/email-templates/signup'
import { InviteEmail } from '@/lib/email-templates/invite'
import { MagicLinkEmail } from '@/lib/email-templates/magic-link'
import { RecoveryEmail } from '@/lib/email-templates/recovery'
import { EmailChangeEmail } from '@/lib/email-templates/email-change'
import { ReauthenticationEmail } from '@/lib/email-templates/reauthentication'

// Configuration
const SITE_NAME = "AquaQBank"
const SENDER_DOMAIN = "notify.aquaqbank.com"
const ROOT_DOMAIN = "aquaqbank.com"
const FROM_DOMAIN = "notify.aquaqbank.com"
const SITE_URL = `https://${ROOT_DOMAIN}`

let _handler: ((request: Request) => Promise<Response>) | null = null

function getHandler(): (request: Request) => Promise<Response> {
  if (_handler) return _handler

  const apiKey = process.env['LOVABLE_API_KEY']
  if (!apiKey) {
    return async () =>
      new Response(
        JSON.stringify({ error: "Lovable email webhook inactive: LOVABLE_API_KEY is not set" }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      )
  }

  _handler = createAuthEmailHandler({
    apiKey,
    from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
    senderDomain: SENDER_DOMAIN,
    sendUrl: process.env['LOVABLE_SEND_URL'],
    emails: {
      signup: {
        subject: 'Verify your email for AquaQBank',
        render: (data) =>
          React.createElement(SignupEmail, {
            siteName: SITE_NAME,
            siteUrl: SITE_URL,
            recipient: data.email,
            confirmationUrl: data.url,
          }),
      },
      invite: {
        subject: "You're invited to AquaQBank",
        render: (data) =>
          React.createElement(InviteEmail, {
            siteName: SITE_NAME,
            siteUrl: SITE_URL,
            confirmationUrl: data.url,
          }),
      },
      magiclink: {
        subject: 'Your AquaQBank sign-in link',
        render: (data) =>
          React.createElement(MagicLinkEmail, {
            siteName: SITE_NAME,
            confirmationUrl: data.url,
          }),
      },
      recovery: {
        subject: 'Reset your AquaQBank password',
        render: (data) =>
          React.createElement(RecoveryEmail, {
            siteName: SITE_NAME,
            confirmationUrl: data.url,
          }),
      },
      email_change: {
        subject: 'Confirm your new email',
        render: (data) =>
          React.createElement(EmailChangeEmail, {
            siteName: SITE_NAME,
            oldEmail: data.old_email ?? '',
            email: data.email,
            newEmail: data.new_email ?? '',
            confirmationUrl: data.url,
          }),
      },
      reauthentication: {
        subject: 'Your verification code',
        render: (data) =>
          React.createElement(ReauthenticationEmail, { token: data.token ?? '' }),
      },
    },
  })

  return _handler
}

export const Route = createFileRoute("/lovable/email/auth/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const activeHandler = getHandler()
        return activeHandler(request)
      },
    },
  },
})
