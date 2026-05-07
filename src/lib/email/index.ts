import { Resend } from 'resend'
import { render } from '@react-email/render'
import { env } from '../../config/env'
import {
  OrderDeliveryEmail,
  type DeliveryItem,
} from './templates/order-delivery'
import { VerifyEmail } from './templates/verify-email'
import { RestockEmail } from './templates/restock'

const useResend = !!env.RESEND_API_KEY
const resend = useResend ? new Resend(env.RESEND_API_KEY) : null

export type SendResult =
  | { ok: true; id: string | null; driver: 'resend' | 'log' }
  | { ok: false; error: string; driver: 'resend' | 'log' }

async function sendEmail(args: {
  to: string
  subject: string
  html: string
  text: string
}): Promise<SendResult> {
  if (!resend) {
    console.log('\n========== EMAIL (driver=log) ==========')
    console.log('To:', args.to)
    console.log('Subject:', args.subject)
    console.log('--- text ---')
    console.log(args.text)
    console.log('========================================\n')
    return { ok: true, id: null, driver: 'log' }
  }
  try {
    const res = await resend.emails.send({
      from: env.RESEND_FROM,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    })
    if (res.error) {
      return { ok: false, error: res.error.message, driver: 'resend' }
    }
    return { ok: true, id: res.data?.id ?? null, driver: 'resend' }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      driver: 'resend',
    }
  }
}

export async function sendVerificationEmail(args: {
  to: string
  customerName: string | null
  url: string
}): Promise<SendResult> {
  const node = VerifyEmail({ customerName: args.customerName, url: args.url })
  const [html, text] = await Promise.all([
    render(node),
    render(node, { plainText: true }),
  ])
  return sendEmail({
    to: args.to,
    subject: 'ยืนยันอีเมลของคุณกับ CubbyStore',
    html,
    text,
  })
}

export async function sendRestockEmail(args: {
  to: string
  customerName: string | null
  productName: string
  productUrl: string
}): Promise<SendResult> {
  const node = RestockEmail({
    customerName: args.customerName,
    productName: args.productName,
    productUrl: args.productUrl,
  })
  const [html, text] = await Promise.all([
    render(node),
    render(node, { plainText: true }),
  ])
  return sendEmail({
    to: args.to,
    subject: `🔔 "${args.productName}" กลับมาขายแล้ว`,
    html,
    text,
  })
}

export async function sendOrderDeliveryEmail(args: {
  to: string
  customerName: string | null
  orderId: string
  totalTHB: string
  items: DeliveryItem[]
}): Promise<SendResult> {
  const node = OrderDeliveryEmail({
    customerName: args.customerName,
    orderId: args.orderId,
    totalTHB: args.totalTHB,
    items: args.items,
  })
  const [html, text] = await Promise.all([render(node), render(node, { plainText: true })])
  const orderShort = args.orderId.slice(0, 8)
  return sendEmail({
    to: args.to,
    subject: `คำสั่งซื้อ ${orderShort} จัดส่งแล้ว — ${args.items.length} รายการ`,
    html,
    text,
  })
}
