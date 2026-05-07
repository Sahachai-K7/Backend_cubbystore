import generatePayload from 'promptpay-qr'
import qrcode from 'qrcode'

export async function buildPromptPayQrDataUrl(
  promptpayId: string,
  amount: number,
): Promise<{ payload: string; dataUrl: string }> {
  const payload = generatePayload(promptpayId, { amount })
  const dataUrl = await qrcode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 2,
    scale: 6,
  })
  return { payload, dataUrl }
}
