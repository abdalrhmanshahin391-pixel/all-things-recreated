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

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({ siteName, siteUrl, confirmationUrl }: InviteEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You&apos;ve been invited to join {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <div style={brandBar}>
          <Text style={brandName}>{siteName}</Text>
        </div>
        <Heading style={h1}>You&apos;re invited</Heading>
        <Text style={text}>
          You&apos;ve been invited to join{' '}
          <Link href={siteUrl} style={link}>
            {siteName}
          </Link>
          . Accept the invitation to set up your account.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Accept invitation
        </Button>
        <Text style={{ ...text, margin: '22px 0 0', fontSize: '13px' }}>
          Button not working? Open this link:{' '}
          <Link href={confirmationUrl} style={link}>
            {confirmationUrl}
          </Link>
        </Text>
        <Hr style={hr} />
        <Text style={footer}>
          If you weren&apos;t expecting this invitation, you can ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail
