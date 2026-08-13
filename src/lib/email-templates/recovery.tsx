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

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({ siteName, confirmationUrl }: RecoveryEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Reset your {siteName} password</Preview>
    <Body style={main}>
      <Container style={container}>
        <div style={brandBar}>
          <Text style={brandName}>{siteName}</Text>
        </div>
        <Heading style={h1}>Reset your password</Heading>
        <Text style={text}>
          We received a request to reset the password for your {siteName} account.
          Choose a new password using the button below.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Set a new password
        </Button>
        <Text style={{ ...text, margin: '22px 0 0', fontSize: '13px' }}>
          Button not working? Open this link:{' '}
          <Link href={confirmationUrl} style={link}>
            {confirmationUrl}
          </Link>
        </Text>
        <Hr style={hr} />
        <Text style={footer}>
          This link expires shortly. If you didn&apos;t request a reset, ignore this
          email — your password stays unchanged.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail
