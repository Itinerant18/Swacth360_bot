import { NextResponse } from 'next/server';
import { Resend } from 'resend';

// Notice we use the environment variable, but fallback to the string if not set.
// Make sure to replace 're_xxxxxxxxx' with your actual key or set RESEND_API_KEY in .env
const resend = new Resend(process.env.RESEND_API_KEY || 're_xxxxxxxxx');

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function POST(_request: Request) {
  try {
    const data = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: 'debayan.seple@gmail.com',
      subject: 'Hello World',
      html: '<p>Congrats on sending your <strong>first email</strong>!</p>'
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ error }, { status: 500 });
  }
}
