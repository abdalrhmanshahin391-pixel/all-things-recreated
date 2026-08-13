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

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({ siteName, confirmationUrl }: MagicLinkEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your sign-in link for {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <div style={brandBar}>
          <Text style={brandName}>{siteName}</Text>
        </div>
        <Heading style={h1}>Sign in to {siteName}</Heading>
        <Text style={text}>
          Use the button below to sign in. The link works once and expires soon.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Sign in
        </Button>
        <Text style={{ ...text, margin: '22px 0 0', fontSize: '13px' }}>
          Button not working? Open this link:{' '}
          <Link href={confirmationUrl} style={link}>
            {confirmationUrl}
          </Link>
        </Text>
        <Hr style={hr} />
        <Text style={footer}>
          If you didn&apos;t ask to sign in, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail
