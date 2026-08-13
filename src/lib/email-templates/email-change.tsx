import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Text,
} from '@react-email/components'

import {
  brandBar,
  brandName,
  button,
  container,
  footer,
  h1,
  hr,
  link,
  main,
  text,
} from './brand'

interface EmailChangeEmailProps {
  siteName: string
  // oldEmail is the user's current address (HookData.OldEmail). For the
  // NEW-recipient half of a secure email_change fanout, `email` equals the
  // recipient (NEW), so the "from" line must render oldEmail to read
  // "from OLD to NEW" instead of "from NEW to NEW".
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  siteName,
  oldEmail,
  email,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your new email address for {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <div style={brandBar}>
          <Text style={brandName}>{siteName}</Text>
        </div>
        <Heading style={h1}>Confirm your new email</Heading>
        <Text style={text}>
          You asked to change the email on your {siteName} account from{' '}
          <strong>{oldEmail || email}</strong> to <strong>{newEmail}</strong>.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Confirm change
        </Button>
        <Text style={{ ...text, margin: '22px 0 0', fontSize: '13px' }}>
          Button not working? Open this link:{' '}
          <Link href={confirmationUrl} style={link}>
            {confirmationUrl}
          </Link>
        </Text>
        <Hr style={hr} />
        <Text style={footer}>
          If you didn&apos;t request this change, ignore this email and your address
          stays the same.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail
