import * as React from 'react'

import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Text,
} from '@react-email/components'

import {
  brandBar,
  brandName,
  codeBox,
  container,
  footer,
  h1,
  hr,
  main,
  text,
} from './brand'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your AquaQBank verification code</Preview>
    <Body style={main}>
      <Container style={container}>
        <div style={brandBar}>
          <Text style={brandName}>AquaQBank</Text>
        </div>
        <Heading style={h1}>Your verification code</Heading>
        <Text style={text}>Enter this code to confirm it&apos;s you:</Text>
        <Text style={codeBox}>{token}</Text>
        <Hr style={hr} />
        <Text style={footer}>
          This code expires shortly. If you didn&apos;t request it, ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail
