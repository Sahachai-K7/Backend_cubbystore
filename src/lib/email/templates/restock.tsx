import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from '@react-email/components'

export function RestockEmail({
  customerName,
  productName,
  productUrl,
}: {
  customerName: string | null
  productName: string
  productUrl: string
}) {
  return (
    <Html>
      <Head />
      <Preview>{`"${productName}" กลับมาขายแล้ว`}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading as="h1" style={h1}>
            🔔 ของกลับมาแล้ว!
          </Heading>
          <Text style={p}>
            สวัสดี{customerName ? ` คุณ${customerName}` : ''} —
            สินค้าที่คุณรอกลับมาวางขายแล้ว
          </Text>
          <Text style={productLine}>"{productName}"</Text>
          <Text style={p}>
            กดปุ่มด้านล่างเพื่อไปหยิบทันที — ของอาจหมดเร็ว
          </Text>
          <Button style={btn} href={productUrl}>
            ไปดูสินค้า →
          </Button>
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
const productLine: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  color: '#111',
  margin: '12px 0',
  padding: 12,
  background: '#f7f7fa',
  borderRadius: 8,
  border: '1px solid #ececec',
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
