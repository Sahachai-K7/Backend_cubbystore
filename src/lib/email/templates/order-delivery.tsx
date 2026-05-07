import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

export type DeliveryItem = {
  productName: string
  payload: string
}

export function OrderDeliveryEmail({
  customerName,
  orderId,
  totalTHB,
  items,
}: {
  customerName: string | null
  orderId: string
  totalTHB: string
  items: DeliveryItem[]
}) {
  const orderShort = orderId.slice(0, 8)
  return (
    <Html>
      <Head />
      <Preview>{`คำสั่งซื้อ ${orderShort} จัดส่งแล้ว — ${items.length} รายการ`}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Heading as="h1" style={h1}>
            🎮 คำสั่งซื้อจัดส่งแล้ว
          </Heading>
          <Text style={p}>
            สวัสดี{customerName ? ` คุณ${customerName}` : ''} ขอบคุณที่อุดหนุนครับ
          </Text>
          <Text style={p}>
            หมายเลขคำสั่งซื้อ:{' '}
            <code style={code}>{orderShort}</code> · ยอดรวม {totalTHB}
          </Text>

          <Heading as="h2" style={h2}>
            รายการที่ได้รับ
          </Heading>
          {items.map((it, idx) => (
            <Section key={idx} style={itemBox}>
              <Text style={itemTitle}>{it.productName}</Text>
              <pre style={payload}>{it.payload}</pre>
            </Section>
          ))}

          <Text style={footer}>
            กรุณาเก็บอีเมลฉบับนี้ไว้เป็นหลักฐาน — หากต้องการดูคำสั่งซื้ออีกครั้ง
            สามารถเข้าไปที่หน้า "ประวัติคำสั่งซื้อ" ในเว็บได้
          </Text>
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
const h2: React.CSSProperties = {
  fontSize: 14,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#666',
  margin: '24px 0 8px',
}
const p: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.6,
  color: '#222',
  margin: '0 0 8px',
}
const code: React.CSSProperties = {
  fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
  fontSize: 13,
  background: '#f0f0f4',
  padding: '2px 6px',
  borderRadius: 4,
}
const itemBox: React.CSSProperties = {
  border: '1px solid #e5e5e5',
  borderRadius: 8,
  padding: 12,
  margin: '8px 0',
}
const itemTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  margin: '0 0 6px',
}
const payload: React.CSSProperties = {
  fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
  fontSize: 13,
  background: '#f7f7fa',
  border: '1px solid #ececec',
  borderRadius: 6,
  padding: 10,
  margin: 0,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
}
const footer: React.CSSProperties = {
  fontSize: 12,
  color: '#888',
  marginTop: 24,
  borderTop: '1px solid #eee',
  paddingTop: 12,
}
