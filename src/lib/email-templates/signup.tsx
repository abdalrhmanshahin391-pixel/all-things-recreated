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

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Verify your email to activate your {siteName} account</Preview>
    <Body style={main}>
      <Container style={container}>
        <div style={brandBar}>
          <Text style={brandName}>{siteName}</Text>
        </div>
        <Heading style={h1}>Verify your email</Heading>
        <Text style={text}>
          Welcome to {siteName}. Confirm {recipient} to activate your account and
          start studying.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Verify my email
        </Button>
        <Text style={{ ...text, margin: '22px 0 0', fontSize: '13px' }}>
          Button not working? Open this link:{' '}
          <Link href={confirmationUrl} style={link}>
            {confirmationUrl}
          </Link>
        </Text>
        <Text style={{ ...text, margin: '18px 0 0', fontSize: '13px' }}>
          Don&apos;t see this email in your inbox next time? Please check your spam or junk
          folder and mark it as &quot;Not spam&quot; so our emails reach you.
        </Text>
        <Hr style={hr} />
        <Text style={footer}>
          If you didn&apos;t create an account, you can safely ignore this email.
          <br />
          <Link href={siteUrl} style={{ ...link, color: '#93a5ae' }}>
            {siteName}
          </Link>
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail
