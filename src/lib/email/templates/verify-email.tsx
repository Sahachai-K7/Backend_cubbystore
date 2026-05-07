import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Text,
} from '@react-email/components'

export function VerifyEmail({
  customerName,
  url,
}: {
  customerName: string | null
  url: string
}) {
  return (
    <Html>
      <Head />
      <Preview>ยืนยันอีเมลของคุณกับ CubbyStore</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading as="h1" style={h1}>
            🎮 ยืนยันอีเมล
          </Heading>
          <Text style={p}>
            สวัสดี{customerName ? ` คุณ${customerName}` : ''} —
            ขอบคุณที่สมัครกับ CubbyStore
          </Text>
          <Text style={p}>
            กดปุ่มด้านล่างเพื่อยืนยันอีเมลของคุณ
            หากไม่ได้สมัครให้เพิกเฉยอีเมลฉบับนี้
          </Text>
          <Button style={btn} href={url}>
            ยืนยันอีเมล
          </Button>
          <Hr style={hr} />
          <Text style={small}>
            หากปุ่มกดไม่ได้ ให้คัดลอกลิงก์ต่อไปนี้ไปวางในเบราว์เซอร์:
          </Text>
          <Text style={mono}>{url}</Text>
        </Container>
      </Body>
    </Html>
  )
}

const body: React.CSSProperties = {
  backgroundColor: '#f5f5f7',
  fontFamily: 'Inter, "Noto Sans Thai", system-ui, sans-serif',
  margin: 0,
  padding: '24px 12px',
}
const container: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e5e5e5',
  borderRadius: 12,
  maxWidth: 560,
  margin: '0 auto',
  padding: 24,
}
const h1: React.CSSProperties = {
  fontSize: 22,
  margin: '0 0 12px',
  letterSpacing: '-0.01em',
}
const p: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.6,
  color: '#222',
  margin: '0 0 8px',
}
const btn: React.CSSProperties = {
  display: 'inline-block',
  padding: '12px 24px',
  background: '#111',
  color: '#fff',
  borderRadius: 8,
  textDecoration: 'none',
  fontSize: 14,
  fontWeight: 600,
  margin: '16px 0',
}
const hr: React.CSSProperties = {
  border: 'none',
  borderTop: '1px solid #eee',
  margin: '20px 0',
}
const small: React.CSSProperties = {
  fontSize: 12,
  color: '#888',
  margin: '0 0 4px',
}
const mono: React.CSSProperties = {
  fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
  fontSize: 12,
  color: '#666',
  background: '#f7f7fa',
  padding: 8,
  borderRadius: 6,
  wordBreak: 'break-all',
  margin: 0,
}
